<#
.SYNOPSIS
    Org Memory Engine - Complete Demo Startup
.DESCRIPTION
    Starts all services and opens demo in browser
.USAGE
    .\start-demo.ps1
#>

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║          🧠 ORG MEMORY ENGINE - DEMO STARTUP              ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "📍 Project: $projectPath"
Write-Host ""

# Step 1: Check Docker
Write-Host "Step 1️⃣: Checking Docker..."
try {
    $dockerVersion = docker --version
    Write-Host "   ✅ Docker: $dockerVersion"
} catch {
    Write-Host "   ❌ Docker not running!"
    Write-Host "   → Start Docker Desktop and try again"
    exit 1
}

# Step 2: Navigate to infra
Write-Host ""
Write-Host "Step 2️⃣: Preparing services..."
cd "$projectPath\org-memory-engine\infra"

# Step 3: Start services
Write-Host "   🚀 Starting Docker services..."
docker-compose down -v 2>$null
docker-compose up -d

# Step 4: Wait for services
Write-Host "   ⏳ Waiting for services to start (60 seconds)..."
$elapsed = 0
while ($elapsed -lt 60) {
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
    $elapsed++
}
Write-Host ""

# Step 5: Check services
Write-Host ""
Write-Host "Step 3️⃣: Checking service status..."
$serviceStatus = docker-compose ps

if ($serviceStatus -match "backend.*Up" -and $serviceStatus -match "postgres.*Up" -and $serviceStatus -match "chromadb.*Up") {
    Write-Host "   ✅ All services running!"
} else {
    Write-Host "   ⚠️ Some services not responding"
    Write-Host "   Waiting 20 more seconds..."
    Start-Sleep -Seconds 20
}

# Step 6: Test backend
Write-Host ""
Write-Host "Step 4️⃣: Testing backend..."
try {
    $response = curl http://localhost:8000/health -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ Backend responding at http://localhost:8000"
        $health = $response.Content | ConvertFrom-Json
        Write-Host "   ✅ Status: $($health.status)"
        Write-Host "   ✅ PostgreSQL: $($health.postgres)"
        Write-Host "   ✅ ChromaDB: $($health.chromadb)"
    }
} catch {
    Write-Host "   ⚠️ Backend not responding yet... it may take a minute"
}

# Step 7: Open demo URLs
Write-Host ""
Write-Host "Step 5️⃣: Opening demo interfaces..."

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║                    ✅ READY FOR DEMO                       ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""

Write-Host "📊 Demo Interfaces:"
Write-Host "   1. Swagger UI: http://localhost:8000/docs"
Write-Host "   2. PostgreSQL: localhost:5432"
Write-Host "   3. ChromaDB: localhost:8001"
Write-Host ""

Write-Host "🔌 Extension: Load unpacked from:"
Write-Host "   $projectPath\extension"
Write-Host ""

Write-Host "📋 Useful Commands:"
Write-Host "   docker-compose ps          - Check service status"
Write-Host "   docker-compose logs -f     - View all logs"
Write-Host "   docker-compose down        - Stop services"
Write-Host ""

Write-Host "🌐 Opening Swagger UI in 3 seconds..."
Start-Sleep -Seconds 3

# Open in browser
Start-Process "http://localhost:8000/docs"

Write-Host ""
Write-Host "💡 DEMO TIPS:"
Write-Host "   • Start with Swagger UI to show endpoints"
Write-Host "   • Use /capture to add sample text"
Write-Host "   • Use /extract-decisions to find decisions"
Write-Host "   • Use /ask to show RAG in action"
Write-Host "   • Open Agent Monitor to show real-time activity"
Write-Host ""