param(
    [string]$ApiBase = "http://127.0.0.1:18080/api",
    [string]$ProjectRoot = "E:\ai\ai_trains",
    [string]$OllamaModel
)

if (-not $OllamaModel) {
    throw "Please provide -OllamaModel with an existing local Ollama model name."
}

$templatePath = Join-Path $ProjectRoot "examples\requests\baseline_infer_alarm_eval.json"
if (-not (Test-Path $templatePath)) {
    throw "Template not found: $templatePath"
}

$payload = Get-Content $templatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$payload.infer_config.ollama_from_model = $OllamaModel

$experiment = Invoke-RestMethod -Method Post -Uri "$ApiBase/experiments" -ContentType "application/json" -Body (($payload | ConvertTo-Json -Depth 10))
$run = Invoke-RestMethod -Method Post -Uri "$ApiBase/experiments/$($experiment.id)/runs"

Write-Host "Experiment created: $($experiment.id)" -ForegroundColor Green
Write-Host "Run created: $($run.id)" -ForegroundColor Green
