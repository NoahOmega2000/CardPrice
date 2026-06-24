$arr = @([PSCustomObject]@{id=1}, [PSCustomObject]@{id=2})
if ($arr.array) {
    Write-Host 'TRUE'
} else {
    Write-Host 'FALSE'
}
