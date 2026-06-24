# server.ps1
# Simple HTTP Server and CardTrader API Proxy written in native PowerShell

# Disable progress bar to prevent hanging in non-interactive tasks
$ProgressPreference = 'SilentlyContinue'

# Force TLS 1.2 and TLS 1.3
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

# Load System.Net.Http assembly to use HttpClient
[Void][System.Reflection.Assembly]::LoadWithPartialName("System.Net.Http")

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host " CardTrader Search Card Proxy Server Running" -ForegroundColor Green
    Write-Host " URL: http://localhost:$port/" -ForegroundColor Cyan
    Write-Host " Press Ctrl+C in your terminal to stop it." -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor Green
} catch {
    Write-Error "Failed to start HttpListener: $_"
    exit
}

# Create cache directory if it doesn't exist
$cacheDir = Join-Path $PSScriptRoot "cache"
if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
}

# Read .env token if exists
$token = ""
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | Foreach-Object {
        if ($_ -match "^\s*CARDTRADER_TOKEN\s*=\s*(.+)$") {
            $token = $Matches[1].Trim()
        }
    }
}

if ($token) {
    Write-Host "Default CardTrader API token loaded from .env" -ForegroundColor Gray
} else {
    Write-Host "No CardTrader API token found in .env (Users must provide it in the UI)" -ForegroundColor DarkYellow
}

# Setup synchronized hashtable for background indexing communication
$syncHash = [hashtable]::Synchronized(@{
    Token    = $token
    Status   = "idle"
    Total    = 0
    Cached   = 0
    SupportedGames = @(1, 4, 5, 15)
    CacheDir = $cacheDir
})

# Count already cached blueprints at startup
$initialCached = Get-ChildItem -Path $cacheDir -Filter "blueprints_*.json"
$syncHash.Cached = $initialCached.Count

Write-Host "Starting background Pokémon card indexer..." -ForegroundColor Gray
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$psThread = [powershell]::Create()
$psThread.Runspace = $rs
$psThread.AddScript({
    param($sync)
    $ProgressPreference = 'SilentlyContinue'
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
    [Void][System.Reflection.Assembly]::LoadWithPartialName("System.Net.Http")
    
    function Write-Log($msg) {
        try {
            $logFile = Join-Path $sync.CacheDir "indexer.log"
            $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            "[ $time ] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
        } catch {}
    }
    
    function Fetch-Expansions($token) {
        Write-Log "Fetching expansions from CardTrader API..."
        $client = New-Object System.Net.Http.HttpClient
        try {
            $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
            $client.DefaultRequestHeaders.UserAgent.ParseAdd("PowerShellProxy/1.0")
            $response = $client.GetAsync("https://api.cardtrader.com/api/v2/expansions").Result
            Write-Log "Expansions response status: $($response.StatusCode) (IsSuccess: $($response.IsSuccessStatusCode))"
            if ($response.IsSuccessStatusCode) {
                return $response.Content.ReadAsStringAsync().Result
            } else {
                $err = $response.Content.ReadAsStringAsync().Result
                Write-Log "Expansions response error: $err"
            }
        } catch {
            $exMsg = if ($_.Exception) { $_.Exception.Message } else { $_.ToString() }
            Write-Log "Expansions exception: $exMsg"
        }
        finally { $client.Dispose() }
        return $null
    }
    
    function Fetch-Blueprints($token, $expansionId) {
        Write-Log "Fetching blueprints for expansion $expansionId..."
        $client = New-Object System.Net.Http.HttpClient
        try {
            $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
            $client.DefaultRequestHeaders.UserAgent.ParseAdd("PowerShellProxy/1.0")
            $response = $client.GetAsync("https://api.cardtrader.com/api/v2/blueprints/export?expansion_id=$expansionId").Result
            Write-Log "Blueprints response status for ${expansionId}: $($response.StatusCode)"
            if ($response.IsSuccessStatusCode) {
                return $response.Content.ReadAsStringAsync().Result
            } else {
                $err = $response.Content.ReadAsStringAsync().Result
                Write-Log "Blueprints response error for ${expansionId}: $err"
            }
        } catch {
            $exMsg = if ($_.Exception) { $_.Exception.Message } else { $_.ToString() }
            Write-Log "Blueprints exception for ${expansionId}: $exMsg"
        }
        finally { $client.Dispose() }
        return $null
    }
    
    Write-Log "Indexer thread started."
    while ($true) {
        if (-not $sync.Token) {
            $sync.Status = "idle_no_token"
            Write-Log "No API token provided yet. Waiting..."
            Start-Sleep -Seconds 3
            continue
        }
        
        Write-Log "API Token found. Starting indexing..."
        $sync.Status = "loading_expansions"
        $expansionsFile = Join-Path $sync.CacheDir "expansions.json"
        $expansionsJson = ""
        if (Test-Path $expansionsFile) {
            Write-Log "Loading expansions from local cache."
            $expansionsJson = [System.IO.File]::ReadAllText($expansionsFile)
        } else {
            $expansionsJson = Fetch-Expansions $sync.Token
            if ($expansionsJson) {
                [System.IO.File]::WriteAllText($expansionsFile, $expansionsJson)
                Write-Log "Expansions saved to local cache."
            }
        }
        
        if (-not $expansionsJson) {
            $sync.Status = "error_expansions"
            Write-Log "Failed to load expansions. Retrying in 10s..."
            Start-Sleep -Seconds 10
            continue
        }
        
        try {
            $expansions = ConvertFrom-Json $expansionsJson
            if ($expansions -is [PSCustomObject] -and $expansions.array) {
                $expansions = $expansions.array
            }
            $targetExpansions = $expansions | Where-Object { $_.game_id -in $sync.SupportedGames }
            $sync.Total = $targetExpansions.Count
            Write-Log "Found $($sync.Total) supported expansions to check."
        } catch {
            $sync.Status = "error_parse"
            Write-Log "Exception parsing expansions JSON. Retrying in 10s..."
            Start-Sleep -Seconds 10
            continue
        }
        
        $sync.Status = "indexing"
        
        foreach ($exp in $targetExpansions) {
            if (-not $sync.Token) { 
                $sync.Status = "paused_no_token"
                break 
            }
            
            $expId = $exp.id
            $cacheFile = Join-Path $sync.CacheDir "blueprints_$expId.json"
            
            if (-not (Test-Path $cacheFile)) {
                $sync.Status = "indexing_fetching"
                $blueprintsJson = Fetch-Blueprints $sync.Token $expId
                if ($blueprintsJson) {
                    [System.IO.File]::WriteAllText($cacheFile, $blueprintsJson)
                    Write-Log "Saved blueprints cache for expansion $expId ($($exp.name))"
                } else {
                    Write-Log "Failed to fetch blueprints for $expId. Sleeping 5s..."
                    Start-Sleep -Seconds 5
                    continue
                }
                Start-Sleep -Seconds 3
            }
            
            $cachedFiles = Get-ChildItem -Path $sync.CacheDir -Filter "blueprints_*.json"
            $sync.Cached = $cachedFiles.Count
        }
        
        $sync.Status = "completed"
        Write-Log "Indexing cycle completed. Next run in 1 hour."
        Start-Sleep -Seconds 3600
    }
}) | Out-Null
$psThread.AddParameter("sync", $syncHash) | Out-Null
$asyncResult = $psThread.BeginInvoke()

# Helper function to query CardTrader API using .NET HttpClient (bypasses Invoke-WebRequest engine checks)
function Invoke-CardTraderGet($targetUrl, $activeToken) {
    $client = New-Object System.Net.Http.HttpClient
    try {
        $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $activeToken)
        $client.DefaultRequestHeaders.UserAgent.ParseAdd("PowerShellProxy/1.0")
        
        $responseTask = $client.GetAsync($targetUrl)
        $response = $responseTask.Result
        
        $contentTask = $response.Content.ReadAsStringAsync()
        $content = $contentTask.Result
        
        return [PSCustomObject]@{
            StatusCode = [int]$response.StatusCode
            Content    = $content
            Success    = $response.IsSuccessStatusCode
            Error      = if (-not $response.IsSuccessStatusCode) { "HTTP $([int]$response.StatusCode): $content" } else { $null }
        }
    }
    catch {
        $msg = if ($_.Exception) { 
            if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
        } else { 
            $_.ToString() 
        }
        return [PSCustomObject]@{
            StatusCode = 500
            Content    = $null
            Success    = $false
            Error      = $msg
        }
    }
    finally {
        $client.Dispose()
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.RawUrl
        $method = $request.HttpMethod
        
        # Strip query parameters for static file routing
        $urlPath = $rawUrl
        if ($rawUrl.Contains("?")) {
            $urlPath = $rawUrl.Substring(0, $rawUrl.IndexOf("?"))
        }

        # Retrieve active CardTrader API Token
        # First check client request headers, then fall back to .env token
        $clientToken = $request.Headers["X-CardTrader-Token"]
        $activeToken = if ($clientToken) { $clientToken } else { $token }
        if ($activeToken -and $syncHash.Token -ne $activeToken) {
            $syncHash.Token = $activeToken
        }

        # Helper to respond with JSON errors
        function Send-JSONError($statusCode, $errorMessage) {
            $response.StatusCode = $statusCode
            $response.ContentType = "application/json; charset=utf-8"
            $json = @{ error = $errorMessage } | ConvertTo-Json
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }

        if ($method -eq "OPTIONS") {
            # Support preflight
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-CardTrader-Token")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Close()
            continue
        }

        # Add basic CORS headers for completeness
        $response.AddHeader("Access-Control-Allow-Origin", "*")

        # Static file routing
        if ($urlPath -eq "/" -or $urlPath -eq "/index.html") {
            $filePath = Join-Path $PSScriptRoot "public\index.html"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($urlPath -eq "/index.css") {
            $filePath = Join-Path $PSScriptRoot "public\index.css"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "text/css; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($urlPath -eq "/app.js") {
            $filePath = Join-Path $PSScriptRoot "public\app.js"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "application/javascript; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        # API Proxy Routing
        elseif ($urlPath.StartsWith("/api/")) {
            if (-not $activeToken) {
                Send-JSONError 401 "Unauthorized: CardTrader API token is missing. Please provide it in the settings panel or in a .env file."
            }
            else {
                if ($urlPath -eq "/api/games") {
                    Write-Host "[$method] Proxying to /games" -ForegroundColor Gray
                    $targetUrl = "https://api.cardtrader.com/api/v2/games"
                    
                    $apiResult = Invoke-CardTraderGet $targetUrl $activeToken
                    if ($apiResult.Success) {
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($apiResult.Content)
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } else {
                        Write-Host "Error in GET /api/games: $($apiResult.Error)" -ForegroundColor Red
                        Send-JSONError $apiResult.StatusCode $apiResult.Error
                    }
                }
                elseif ($urlPath -eq "/api/expansions") {
                    Write-Host "[$method] Proxying to /expansions" -ForegroundColor Gray
                    $targetUrl = "https://api.cardtrader.com/api/v2/expansions"
                    
                    $apiResult = Invoke-CardTraderGet $targetUrl $activeToken
                    if ($apiResult.Success) {
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($apiResult.Content)
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } else {
                        Write-Host "Error in GET /api/expansions: $($apiResult.Error)" -ForegroundColor Red
                        Send-JSONError $apiResult.StatusCode $apiResult.Error
                    }
                }
                elseif ($urlPath -eq "/api/blueprints") {
                    # Parse expansion_id from query params
                    $expansionId = ""
                    if ($rawUrl -match "expansion_id=(\d+)") {
                        $expansionId = $Matches[1]
                    }

                    if (-not $expansionId) {
                        Send-JSONError 400 "expansion_id query parameter is required."
                    }
                    else {
                        # Local caching to avoid CardTrader blueprint export rate limits
                        $cacheFile = Join-Path $cacheDir "blueprints_$expansionId.json"
                        if (Test-Path $cacheFile) {
                            Write-Host "[$method] Serving blueprints for expansion $expansionId from Cache" -ForegroundColor DarkGreen
                            $bytes = [System.IO.File]::ReadAllBytes($cacheFile)
                            $response.ContentType = "application/json; charset=utf-8"
                            $response.OutputStream.Write($bytes, 0, $bytes.Length)
                        }
                        else {
                            Write-Host "[$method] Proxying blueprints fetch for expansion $expansionId (Caching response)" -ForegroundColor Gray
                            $targetUrl = "https://api.cardtrader.com/api/v2/blueprints/export?expansion_id=$expansionId"
                            
                            $apiResult = Invoke-CardTraderGet $targetUrl $activeToken
                            if ($apiResult.Success) {
                                # Save to local disk cache
                                [System.IO.File]::WriteAllText($cacheFile, $apiResult.Content)
                                $bytes = [System.Text.Encoding]::UTF8.GetBytes($apiResult.Content)
                                $response.ContentType = "application/json; charset=utf-8"
                                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                            } else {
                                Write-Host "Error in GET /api/blueprints: $($apiResult.Error)" -ForegroundColor Red
                                Send-JSONError $apiResult.StatusCode $apiResult.Error
                            }
                        }
                    }
                }
                elseif ($urlPath -eq "/api/products") {
                    # Parse blueprint_id or expansion_id from query params
                    $blueprintId = ""
                    if ($rawUrl -match "blueprint_id=(\d+)") {
                        $blueprintId = $Matches[1]
                    }
                    $expansionId = ""
                    if ($rawUrl -match "expansion_id=(\d+)") {
                        $expansionId = $Matches[1]
                    }

                    if (-not $blueprintId -and -not $expansionId) {
                        Send-JSONError 400 "Either blueprint_id or expansion_id query parameter is required."
                    }
                    elseif ($blueprintId) {
                        Write-Host "[$method] Fetching products for blueprint $blueprintId" -ForegroundColor Gray
                        $targetUrl = "https://api.cardtrader.com/api/v2/marketplace/products?blueprint_id=$blueprintId"
                        
                        $apiResult = Invoke-CardTraderGet $targetUrl $activeToken
                        if ($apiResult.Success) {
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($apiResult.Content)
                            $response.ContentType = "application/json; charset=utf-8"
                            $response.OutputStream.Write($bytes, 0, $bytes.Length)
                        } else {
                            Write-Host "Error in GET /api/products (blueprint): $($apiResult.Error)" -ForegroundColor Red
                            Send-JSONError $apiResult.StatusCode $apiResult.Error
                        }
                    }
                    else {
                        Write-Host "[$method] Fetching products for expansion $expansionId" -ForegroundColor Gray
                        $targetUrl = "https://api.cardtrader.com/api/v2/marketplace/products?expansion_id=$expansionId"
                        
                        $apiResult = Invoke-CardTraderGet $targetUrl $activeToken
                        if ($apiResult.Success) {
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($apiResult.Content)
                            $response.ContentType = "application/json; charset=utf-8"
                            $response.OutputStream.Write($bytes, 0, $bytes.Length)
                        } else {
                            Write-Host "Error in GET /api/products (expansion): $($apiResult.Error)" -ForegroundColor Red
                            Send-JSONError $apiResult.StatusCode $apiResult.Error
                        }
                    }
                }
                elseif ($urlPath -eq "/api/search") {
                    $query = ""
                    if ($rawUrl -match "q=([^&]+)") {
                        $query = [Uri]::UnescapeDataString($Matches[1]).Trim()
                    }
                    $requestedGameId = ""
                    if ($rawUrl -match "game_id=(\d+)") {
                        $requestedGameId = $Matches[1]
                    }
                    
                    if (-not $query -or $query.Length -lt 2) {
                        Send-JSONError 400 "Search query 'q' must be at least 2 characters long."
                    }
                    else {
                        Write-Host "[$method] Global search for '$query' across cached expansions" -ForegroundColor Gray
                        
                        $results = [System.Collections.Generic.List[PSCustomObject]]::new()
                        
                        $expansionsMap = @{}
                        $expansionsFile = Join-Path $cacheDir "expansions.json"
                        if (Test-Path $expansionsFile) {
                            try {
                                $expansionsObj = Get-Content $expansionsFile -Raw | ConvertFrom-Json
                                $loopCount = 0
                                foreach ($exp in $expansionsObj) {
                                    if ($loopCount -eq 0) {
                                        Write-Host "DEBUG: First item type: $($exp.GetType().Name)" -ForegroundColor Yellow
                                        Write-Host "DEBUG: First item properties: $($exp | Get-Member -MemberType Properties | Select-Object -ExpandProperty Name) " -ForegroundColor Yellow
                                    }
                                    if ($null -ne $exp.id) {
                                        $idStr = [string]$exp.id
                                        $expansionsMap[$idStr] = $exp
                                        $loopCount++
                                    }
                                }
                                Write-Host "DEBUG: Loop iterated $loopCount times. First key: $(if($loopCount -gt 0){($expansionsMap.Keys | Select -First 1)}else{'None'})"
                                Write-Host "Loaded $($expansionsMap.Count) expansions into map." -ForegroundColor DarkCyan
                                Write-Host "Loaded $($expansionsMap.Count) expansions into map." -ForegroundColor DarkCyan
                            } catch {
                                Write-Host "Error parsing expansions.json: $_" -ForegroundColor Red
                            }
                        }
                        
                        $files = Get-ChildItem -Path $cacheDir -Filter "blueprints_*.json"
                        
                        # Normalize query: strip accents and split by space
                        $normalizedQuery = $query.Normalize([System.Text.NormalizationForm]::FormD)
                        $normalizedQuery = [System.Text.RegularExpressions.Regex]::Replace($normalizedQuery, "[\u0300-\u036f]", "").ToLower()
                        $queryWords = $normalizedQuery -split '\s+' | Where-Object { $_.Length -gt 0 }
                        
                        foreach ($file in $files) {
                            $fileExpansionId = ""
                            if ($file.Name -match "blueprints_(\d+)\.json") {
                                $fileExpansionId = $Matches[1]
                            }
                            
                            # Skip if file belongs to a different game
                            if ($requestedGameId -and $fileExpansionId) {
                                if ($expansionsMap.ContainsKey($fileExpansionId)) {
                                    if ($expansionsMap[$fileExpansionId].game_id -ne [int]$requestedGameId) {
                                        continue
                                    }
                                } else {
                                    continue
                                }
                            }
                            
                            try {
                                $content = [System.IO.File]::ReadAllText($file.FullName)
                                $contentLower = $content.ToLower()
                                
                                # Fast check if file contains all words
                                $fileMatches = $true
                                foreach ($word in $queryWords) {
                                    if (-not $contentLower.Contains($word)) {
                                        $fileMatches = $false
                                        break
                                    }
                                }
                                
                                if ($fileMatches) {
                                    $blueprints = ConvertFrom-Json $content
                                    foreach ($bp in $blueprints) {
                                        $bpNameNormalized = $bp.name.Normalize([System.Text.NormalizationForm]::FormD)
                                        $bpNameNormalized = [System.Text.RegularExpressions.Regex]::Replace($bpNameNormalized, "[\u0300-\u036f]", "").ToLower()
                                        
                                        $bpSearchTarget = $bpNameNormalized
                                        if ($bp.version) {
                                            $bpSearchTarget += " " + $bp.version.ToLower()
                                        }
                                        if ($bp.fixed_properties -and $bp.fixed_properties.collector_number) {
                                            $bpSearchTarget += " " + $bp.fixed_properties.collector_number.ToLower()
                                        }
                                        
                                        $bpMatches = $true
                                        foreach ($word in $queryWords) {
                                            if (-not $bpSearchTarget.Contains($word)) {
                                                $bpMatches = $false
                                                break
                                            }
                                        }
                                        
                                        if ($bpMatches) {
                                            $expInfo = $expansionsMap[$bp.expansion_id.ToString()]
                                            $results.Add([PSCustomObject]@{
                                                id             = $bp.id
                                                name           = $bp.name
                                                version        = $bp.version
                                                image_url      = $bp.image_url
                                                expansion_id   = $bp.expansion_id
                                                expansion_name = if ($expInfo) { $expInfo.name } else { "Unknown Set" }
                                                expansion_code = if ($expInfo) { $expInfo.code } else { "" }
                                                slug           = $bp.slug
                                            })
                                        }
                                        if ($results.Count -ge 300) { break }
                                    }
                                }
                            } catch {}
                            if ($results.Count -ge 300) { break }
                        }
                        
                        $json = "[]"
                        if ($results.Count -eq 1) {
                            $json = "[$($results[0] | ConvertTo-Json -Depth 4 -Compress)]"
                        } elseif ($results.Count -gt 1) {
                            $json = $results | ConvertTo-Json -Depth 4
                        }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }
                elseif ($urlPath -eq "/api/index-status") {
                    $json = @{
                        totalExpansions  = $syncHash.Total
                        cachedExpansions = $syncHash.Cached
                        status           = $syncHash.Status
                    } | ConvertTo-Json
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
                else {
                    Send-JSONError 404 "API Endpoint Not Found"
                }
            }
        }
        else {
            $response.StatusCode = 404
        }

        $response.Close()
    }
    catch {
        Write-Host "Error occurred in request loop: $_" -ForegroundColor Red
    }
}
