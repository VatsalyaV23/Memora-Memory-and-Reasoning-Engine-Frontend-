<#
.SYNOPSIS
    Load sample demo data for judges
.USAGE
    .\demo-data.ps1
#>

Write-Host ""
Write-Host "📥 Loading Demo Data..."
Write-Host ""

$backendUrl = "http://localhost:8000"

# Sample texts to capture
$samples = @(
    @{
        text = "In our Q4 planning meeting, we decided to migrate from MongoDB to PostgreSQL. The main reasons were: 1) Better consistency and ACID compliance, 2) Stronger foreign key support, 3) More cost-effective at scale. We approved this decision with 95% team consensus. The migration will start in Q1 next year."
        source = "meeting"
        title = "Database Migration Decision"
    },
    @{
        text = "After reviewing multiple frameworks, we chose FastAPI for our new backend service. Key factors: async/await support for high concurrency, automatic OpenAPI documentation, built-in validation with Pydantic, and excellent performance benchmarks. Approved on 2024-04-10."
        source = "slack"
        title = "Framework Selection"
    },
    @{
        text = "We decided to use Docker and Kubernetes for containerization and orchestration. This decision will enable auto-scaling, better resource management, and easier deployment across environments. The DevOps team will handle implementation starting next sprint."
        source = "email"
        title = "Infrastructure Modernization"
    }
)

# Capture samples
foreach ($sample in $samples) {
    Write-Host "📄 Capturing: $($sample.title)..."
    
    try {
        $response = Invoke-WebRequest `
            -Uri "$backendUrl/capture" `
            -Method POST `
            -Headers @{"Content-Type"="application/json"} `
            -Body (@{
                text = $sample.text
                source = $sample.source
                url = "http://demo"
            } | ConvertTo-Json) `
            -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            $data = $response.Content | ConvertFrom-Json
            Write-Host "   ✅ Captured: $($data.id)"
        }
    } catch {
        Write-Host "   ❌ Error: $_"
    }
}

Write-Host ""
Write-Host "✅ Demo data loaded!"
Write-Host ""
Write-Host "Now you can:"
Write-Host "  1. Go to /docs and try /extract-decisions"
Write-Host "  2. Go to /docs and try /ask"
Write-Host "  3. Ask questions like:"
Write-Host "     - 'Why did we choose PostgreSQL?'"
Write-Host "     - 'What framework are we using?'"
Write-Host "     - 'What infrastructure decisions did we make?'"
Write-Host ""