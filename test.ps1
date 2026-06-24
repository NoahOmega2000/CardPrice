$expansionsMap = @{}
$expansionsObj = Get-Content "cache\expansions.json" -Raw | ConvertFrom-Json
Write-Host "Count: $($expansionsObj.Count)"
foreach ($exp in $expansionsObj) {
    if ($null -ne $exp.id) {
        $expansionsMap[$exp.id.ToString()] = $exp
    }
}
Write-Host "Map size: $($expansionsMap.Count)"
