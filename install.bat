@echo off
REM Installation script for ELO AS PDF Import Service
REM This script sets up the required directories and copies files

echo ========================================
echo ELO AS PDF Import Service Installation
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with administrator privileges...
) else (
    echo WARNING: Not running as administrator. Some operations may fail.
    echo.
)

REM Create required directories
echo Creating required directories...
if not exist "C:\temp\pdf_import" mkdir "C:\temp\pdf_import"
if not exist "C:\temp\pdf_import\processed" mkdir "C:\temp\pdf_import\processed"
if not exist "C:\temp\pdf_import\error" mkdir "C:\temp\pdf_import\error"

echo Directories created:
echo - C:\temp\pdf_import
echo - C:\temp\pdf_import\processed
echo - C:\temp\pdf_import\error
echo.

REM Set permissions (if running as admin)
echo Setting directory permissions...
icacls "C:\temp\pdf_import" /grant "Everyone:(OI)(CI)F" /T >nul 2>&1
if %errorLevel% == 0 (
    echo Permissions set successfully.
) else (
    echo WARNING: Could not set permissions. Please ensure ELO service account has access.
)
echo.

REM Copy configuration file to ELO AS directory (user needs to specify)
echo ========================================
echo MANUAL STEPS REQUIRED:
echo ========================================
echo.
echo 1. Copy the following files to your ELO AS script directory:
echo    - PDFImportService.js (basic version)
echo    - PDFImportService_Enhanced.js (enhanced version)
echo    - config.json
echo.
echo 2. Register the script in ELO Administration:
echo    - Open ELO Administration Console
echo    - Navigate to Automation Services
echo    - Add new script: PDFImportService.js or PDFImportService_Enhanced.js
echo    - Set execution interval to 30 seconds
echo.
echo 3. Verify ELO configuration:
echo    - Ensure metadata mask 'Eingangsrechnung' exists
echo    - Ensure workflow template 'dps.invoice.Base' exists
echo    - Verify archive path permissions
echo.
echo 4. Test the installation:
echo    - Copy a test PDF file to C:\temp\pdf_import
echo    - Monitor ELO AS logs for processing
echo    - Check if file appears in ELO archive
echo.
echo ========================================
echo Installation preparation completed!
echo ========================================
echo.
echo Press any key to open the installation directory...
pause >nul
explorer "%~dp0"

echo.
echo Installation script finished.
pause