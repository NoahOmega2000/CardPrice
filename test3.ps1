$arr = @([PSCustomObject]@{id=1}, [PSCustomObject]@{id=2})
Write-Host "Is PSCustomObject? $($arr -is [PSCustomObject])"
if ($arr -is [PSCustomObject] -and $arr.array) {
    Write-Host "Entered IF!"
} else {
    Write-Host "Did NOT enter IF."
}
