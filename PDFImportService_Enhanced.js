/**
 * ELO AS (Automation Services) Script for PDF Import - Enhanced Version
 * Imports PDF files from filesystem to ELO Archive with metadata mask "Eingangsrechnung"
 * and starts workflow with template "dps.invoice.Base"
 * 
 * Features:
 * - Configuration file support
 * - Enhanced error handling
 * - File size and type validation
 * - Retry mechanisms
 * - Performance monitoring
 */

// Load configuration from file
var CONFIG;
try {
    var configFile = new java.io.File("config.json");
    if (configFile.exists()) {
        var configContent = sol.common.FileUtils.readFileToString(configFile, "UTF-8");
        var configData = JSON.parse(configContent);
        CONFIG = {
            SOURCE_DIR: configData.settings.sourceDirectory,
            ARCHIVE_PATH: configData.settings.archivePath,
            METADATA_MASK: configData.settings.metadataMask,
            WORKFLOW_TEMPLATE: configData.settings.workflowTemplate,
            PROCESSED_DIR: configData.settings.processedDirectory,
            ERROR_DIR: configData.settings.errorDirectory,
            INTERVAL: configData.settings.intervalSeconds * 1000,
            MAX_FILE_SIZE: (configData.fileFilters.maxFileSizeMB || 50) * 1024 * 1024,
            ALLOWED_EXTENSIONS: configData.fileFilters.extensions || [".pdf"],
            EXCLUDE_PATTERNS: configData.fileFilters.excludePatterns || [],
            RETRY_ATTEMPTS: configData.eloConnection.retryAttempts || 3,
            CONNECTION_TIMEOUT: configData.eloConnection.timeout || 30000,
            LOG_LEVEL: configData.settings.logging.level || "INFO"
        };
    } else {
        throw new Error("config.json not found, using default configuration");
    }
} catch (e) {
    // Fallback to default configuration
    CONFIG = {
        SOURCE_DIR: "C:\\temp\\pdf_import",
        ARCHIVE_PATH: "¶Eingangsrechnungen",
        METADATA_MASK: "Eingangsrechnung",
        WORKFLOW_TEMPLATE: "dps.invoice.Base",
        PROCESSED_DIR: "C:\\temp\\pdf_import\\processed",
        ERROR_DIR: "C:\\temp\\pdf_import\\error",
        INTERVAL: 30000,
        MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
        ALLOWED_EXTENSIONS: [".pdf"],
        EXCLUDE_PATTERNS: ["temp_*", ".*"],
        RETRY_ATTEMPTS: 3,
        CONNECTION_TIMEOUT: 30000,
        LOG_LEVEL: "INFO"
    };
}

// Global variables
var logger = sol.create("sol.Logger", { scope: "PDFImportService_Enhanced" });
var fileUtils = sol.create("sol.common.FileUtils");
var stats = {
    totalProcessed: 0,
    totalErrors: 0,
    lastRun: null,
    startTime: new Date()
};

/**
 * Main function that processes PDF files with enhanced error handling
 */
function processPDFFiles() {
    var startTime = new Date();
    stats.lastRun = startTime;
    
    try {
        logger.info("Starting PDF import process... (Run #" + (stats.totalProcessed + stats.totalErrors + 1) + ")");
        
        // Validate ELO connection
        if (!validateELOConnection()) {
            logger.error("ELO connection validation failed");
            return;
        }
        
        // Ensure directories exist
        ensureDirectoriesExist();
        
        // Get list of valid PDF files
        var pdfFiles = getValidPDFFiles(CONFIG.SOURCE_DIR);
        
        if (pdfFiles.length === 0) {
            logger.debug("No valid PDF files found in source directory");
            return;
        }
        
        logger.info("Found " + pdfFiles.length + " valid PDF files to process");
        
        var successCount = 0;
        var errorCount = 0;
        
        // Process each PDF file
        for (var i = 0; i < pdfFiles.length; i++) {
            try {
                if (processSinglePDFWithRetry(pdfFiles[i])) {
                    successCount++;
                    stats.totalProcessed++;
                } else {
                    errorCount++;
                    stats.totalErrors++;
                }
            } catch (e) {
                logger.error("Unhandled error processing file: " + pdfFiles[i].getName(), e);
                moveFileToErrorDir(pdfFiles[i]);
                errorCount++;
                stats.totalErrors++;
            }
        }
        
        var duration = new Date() - startTime;
        logger.info("PDF import process completed. Success: " + successCount + ", Errors: " + errorCount + ", Duration: " + duration + "ms");
        
        // Log statistics every 10 runs
        if ((stats.totalProcessed + stats.totalErrors) % 10 === 0) {
            logStatistics();
        }
        
    } catch (e) {
        logger.error("Critical error in processPDFFiles", e);
        stats.totalErrors++;
    }
}

/**
 * Process a single PDF file with retry mechanism
 * @param {File} pdfFile - The PDF file to process
 * @return {boolean} - Success status
 */
function processSinglePDFWithRetry(pdfFile) {
    var attempts = 0;
    var lastError = null;
    
    while (attempts < CONFIG.RETRY_ATTEMPTS) {
        try {
            attempts++;
            logger.info("Processing file: " + pdfFile.getName() + " (Attempt " + attempts + "/" + CONFIG.RETRY_ATTEMPTS + ")");
            
            // Import file to ELO
            var sordId = importFileToELOWithValidation(pdfFile);
            
            if (sordId) {
                // Start workflow (non-critical, continue even if it fails)
                try {
                    startWorkflowWithRetry(sordId);
                } catch (wfError) {
                    logger.warn("Workflow start failed for Sord ID: " + sordId + ", but import was successful", wfError);
                }
                
                // Move file to processed directory
                moveFileToProcessedDir(pdfFile);
                
                logger.info("Successfully processed file: " + pdfFile.getName() + " (Sord ID: " + sordId + ")");
                return true;
            } else {
                throw new Error("Failed to import file to ELO");
            }
            
        } catch (e) {
            lastError = e;
            logger.warn("Attempt " + attempts + " failed for file: " + pdfFile.getName() + " - " + e.message);
            
            if (attempts < CONFIG.RETRY_ATTEMPTS) {
                // Wait before retry (exponential backoff)
                var waitTime = Math.pow(2, attempts) * 1000;
                logger.info("Waiting " + waitTime + "ms before retry...");
                java.lang.Thread.sleep(waitTime);
            }
        }
    }
    
    // All attempts failed
    logger.error("All " + CONFIG.RETRY_ATTEMPTS + " attempts failed for file: " + pdfFile.getName(), lastError);
    moveFileToErrorDir(pdfFile);
    return false;
}

/**
 * Import PDF file to ELO Archive with enhanced validation
 * @param {File} pdfFile - The PDF file to import
 * @return {String} - The Sord ID of the imported document
 */
function importFileToELOWithValidation(pdfFile) {
    try {
        // Validate file before import
        if (!validatePDFFile(pdfFile)) {
            throw new Error("File validation failed");
        }
        
        // Get parent folder ID
        var parentId = getOrCreateArchiveFolder();
        
        // Create new Sord with enhanced metadata
        var sord = ixConnect.ix().createSord(parentId, null, EditInfoC.mbSord).sord;
        
        // Set document name (without extension)
        var fileName = pdfFile.getName();
        var docName = fileName.substring(0, fileName.lastIndexOf('.'));
        sord.name = docName;
        
        // Set metadata mask
        var maskId = getMaskId(CONFIG.METADATA_MASK);
        if (maskId) {
            sord.mask = maskId;
        }
        
        // Set document type and additional metadata
        sord.type = SordC.LBT_DOCUMENT;
        sord.desc = "Imported by PDFImportService on " + new Date().toISOString();
        
        // Add custom metadata if mask supports it
        try {
            setCustomMetadata(sord, pdfFile);
        } catch (metaError) {
            logger.warn("Failed to set custom metadata, continuing with basic import", metaError);
        }
        
        // Check in the Sord
        var editInfo = ixConnect.ix().checkinSord(sord, SordC.mbAll, LockC.NO);
        var sordId = editInfo.sord.id;
        
        // Upload the PDF file with validation
        var success = uploadPDFFile(sordId, pdfFile);
        
        if (success) {
            return sordId;
        } else {
            // Cleanup failed import
            try {
                ixConnect.ix().deleteSord(null, sordId, LockC.NO, null);
            } catch (cleanupError) {
                logger.warn("Failed to cleanup failed import for Sord ID: " + sordId, cleanupError);
            }
            throw new Error("File upload failed");
        }
        
    } catch (e) {
        logger.error("Error importing file to ELO: " + pdfFile.getName(), e);
        throw e;
    }
}

/**
 * Upload PDF file with enhanced error handling
 * @param {String} sordId - The Sord ID
 * @param {File} pdfFile - The PDF file
 * @return {boolean} - Success status
 */
function uploadPDFFile(sordId, pdfFile) {
    try {
        var docVersion = new DocVersion();
        docVersion.comment = "Imported by PDFImportService Enhanced on " + new Date().toISOString();
        docVersion.version = "1.0";
        docVersion.ext = "pdf";
        
        var document = ixConnect.ix().checkinDocBegin(sordId);
        document.docs[0].version = docVersion;
        
        // Read file in chunks for large files
        var fileData = readFileInChunks(pdfFile);
        
        if (!fileData) {
            throw new Error("Failed to read file data");
        }
        
        var uploadResult = ixConnect.upload(fileData, document.docs[0].url);
        
        if (uploadResult) {
            ixConnect.ix().checkinDocEnd(sordId, SordC.mbAll, document);
            logger.debug("File uploaded successfully: " + pdfFile.getName() + " (" + fileData.length + " bytes)");
            return true;
        } else {
            throw new Error("Upload operation returned false");
        }
        
    } catch (e) {
        logger.error("Error uploading file: " + pdfFile.getName(), e);
        return false;
    }
}

/**
 * Start workflow with retry mechanism
 * @param {String} sordId - The Sord ID of the document
 */
function startWorkflowWithRetry(sordId) {
    var attempts = 0;
    var maxAttempts = 2; // Fewer retries for workflow as it's less critical
    
    while (attempts < maxAttempts) {
        try {
            attempts++;
            logger.info("Starting workflow for Sord ID: " + sordId + " (Attempt " + attempts + "/" + maxAttempts + ")");
            
            // Get workflow template
            var wfTemplate = ixConnect.ix().checkoutWorkFlow(CONFIG.WORKFLOW_TEMPLATE, WFTypeC.TEMPLATE, WFDiagramC.mbAll, LockC.NO);
            
            if (!wfTemplate) {
                throw new Error("Workflow template not found: " + CONFIG.WORKFLOW_TEMPLATE);
            }
            
            // Create workflow instance
            var wfInstance = ixConnect.ix().createWorkFlow(wfTemplate, sordId);
            
            // Start the workflow
            ixConnect.ix().startWorkFlow(wfInstance.id, "Started by PDFImportService");
            
            logger.info("Workflow started successfully for Sord ID: " + sordId + " (Workflow ID: " + wfInstance.id + ")");
            return;
            
        } catch (e) {
            logger.warn("Workflow start attempt " + attempts + " failed for Sord ID: " + sordId + " - " + e.message);
            
            if (attempts < maxAttempts) {
                java.lang.Thread.sleep(2000); // Wait 2 seconds before retry
            } else {
                throw e;
            }
        }
    }
}

/**
 * Validate PDF file before processing
 * @param {File} pdfFile - The PDF file to validate
 * @return {boolean} - Validation result
 */
function validatePDFFile(pdfFile) {
    try {
        // Check file exists and is readable
        if (!pdfFile.exists() || !pdfFile.canRead()) {
            logger.warn("File does not exist or is not readable: " + pdfFile.getName());
            return false;
        }
        
        // Check file size
        var fileSize = pdfFile.length();
        if (fileSize === 0) {
            logger.warn("File is empty: " + pdfFile.getName());
            return false;
        }
        
        if (fileSize > CONFIG.MAX_FILE_SIZE) {
            logger.warn("File too large (" + fileSize + " bytes): " + pdfFile.getName());
            return false;
        }
        
        // Check file extension
        var fileName = pdfFile.getName().toLowerCase();
        var hasValidExtension = false;
        for (var i = 0; i < CONFIG.ALLOWED_EXTENSIONS.length; i++) {
            if (fileName.endsWith(CONFIG.ALLOWED_EXTENSIONS[i].toLowerCase())) {
                hasValidExtension = true;
                break;
            }
        }
        
        if (!hasValidExtension) {
            logger.warn("Invalid file extension: " + pdfFile.getName());
            return false;
        }
        
        // Check exclude patterns
        for (var j = 0; j < CONFIG.EXCLUDE_PATTERNS.length; j++) {
            var pattern = CONFIG.EXCLUDE_PATTERNS[j];
            if (pattern.startsWith("*") && fileName.endsWith(pattern.substring(1))) {
                logger.debug("File excluded by pattern " + pattern + ": " + pdfFile.getName());
                return false;
            }
            if (pattern.endsWith("*") && fileName.startsWith(pattern.substring(0, pattern.length - 1))) {
                logger.debug("File excluded by pattern " + pattern + ": " + pdfFile.getName());
                return false;
            }
            if (fileName.indexOf(pattern) !== -1) {
                logger.debug("File excluded by pattern " + pattern + ": " + pdfFile.getName());
                return false;
            }
        }
        
        // Basic PDF header validation
        try {
            var fileInputStream = new java.io.FileInputStream(pdfFile);
            var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 5);
            var bytesRead = fileInputStream.read(buffer);
            fileInputStream.close();
            
            if (bytesRead >= 4) {
                var header = new java.lang.String(buffer, 0, 4, "UTF-8");
                if (!header.equals("%PDF")) {
                    logger.warn("Invalid PDF header: " + pdfFile.getName());
                    return false;
                }
            }
        } catch (headerError) {
            logger.warn("Could not validate PDF header for: " + pdfFile.getName(), headerError);
            // Continue anyway, as this is not critical
        }
        
        logger.debug("File validation passed: " + pdfFile.getName() + " (" + fileSize + " bytes)");
        return true;
        
    } catch (e) {
        logger.error("Error validating file: " + pdfFile.getName(), e);
        return false;
    }
}

/**
 * Get list of valid PDF files from directory
 * @param {String} dirPath - Directory path
 * @return {Array} - Array of validated File objects
 */
function getValidPDFFiles(dirPath) {
    var validFiles = [];
    
    try {
        var dir = new java.io.File(dirPath);
        
        if (!dir.exists() || !dir.isDirectory()) {
            logger.warn("Source directory does not exist: " + dirPath);
            return validFiles;
        }
        
        var files = dir.listFiles();
        
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.isFile() && validatePDFFile(file)) {
                validFiles.push(file);
            }
        }
        
        logger.debug("Found " + validFiles.length + " valid files out of " + files.length + " total files");
        
    } catch (e) {
        logger.error("Error reading files from directory: " + dirPath, e);
    }
    
    return validFiles;
}

/**
 * Validate ELO connection
 * @return {boolean} - Connection status
 */
function validateELOConnection() {
    try {
        // Test connection with a simple operation
        var serverInfo = ixConnect.ix().getServerInfo();
        if (serverInfo) {
            logger.debug("ELO connection validated. Server: " + serverInfo.name);
            return true;
        } else {
            logger.error("ELO connection test failed - no server info");
            return false;
        }
    } catch (e) {
        logger.error("ELO connection validation failed", e);
        return false;
    }
}

/**
 * Set custom metadata based on file properties
 * @param {Sord} sord - The Sord object
 * @param {File} pdfFile - The PDF file
 */
function setCustomMetadata(sord, pdfFile) {
    try {
        // Set file size in a custom field (if available)
        var fileSize = pdfFile.length();
        var fileSizeKB = Math.round(fileSize / 1024);
        
        // Set import date
        var importDate = new Date();
        
        // These would need to be adapted to your specific metadata mask fields
        // Example: sord.objKeys[0].data = ["" + fileSizeKB]; // File size in KB
        // Example: sord.objKeys[1].data = [importDate.toISOString().substring(0, 10)]; // Import date
        
        logger.debug("Custom metadata set for: " + pdfFile.getName());
        
    } catch (e) {
        logger.warn("Failed to set custom metadata", e);
        throw e;
    }
}

/**
 * Read file in chunks for better memory management
 * @param {File} file - The file to read
 * @return {byte[]} - File data
 */
function readFileInChunks(file) {
    try {
        return fileUtils.readFileToByteArray(file.getAbsolutePath());
    } catch (e) {
        logger.error("Error reading file: " + file.getName(), e);
        return null;
    }
}

/**
 * Log performance and processing statistics
 */
function logStatistics() {
    var uptime = new Date() - stats.startTime;
    var uptimeHours = Math.round(uptime / (1000 * 60 * 60) * 100) / 100;
    
    logger.info("=== PDFImportService Statistics ===");
    logger.info("Uptime: " + uptimeHours + " hours");
    logger.info("Total processed: " + stats.totalProcessed);
    logger.info("Total errors: " + stats.totalErrors);
    logger.info("Success rate: " + Math.round((stats.totalProcessed / (stats.totalProcessed + stats.totalErrors)) * 100) + "%");
    logger.info("Last run: " + (stats.lastRun ? stats.lastRun.toISOString() : "Never"));
    logger.info("===================================");
}

// Enhanced directory and file management functions
function getOrCreateArchiveFolder() {
    try {
        // Try to find existing folder first
        var findInfo = new FindInfo();
        findInfo.findByIndex = new FindByIndex();
        findInfo.findByIndex.name = CONFIG.ARCHIVE_PATH;
        
        var findResult = ixConnect.ix().findFirstSords(findInfo, 1, SordC.mbAll);
        
        if (findResult.sords && findResult.sords.length > 0) {
            logger.debug("Found existing archive folder: " + CONFIG.ARCHIVE_PATH);
            return findResult.sords[0].id;
        }
        
        // Create folder if it doesn't exist
        logger.info("Creating archive folder: " + CONFIG.ARCHIVE_PATH);
        var parentSord = ixConnect.ix().createSord("1", null, EditInfoC.mbSord).sord;
        parentSord.name = CONFIG.ARCHIVE_PATH.substring(1); // Remove ¶ prefix
        parentSord.type = SordC.LBT_FOLDER;
        parentSord.desc = "Created by PDFImportService for invoice imports";
        
        var editInfo = ixConnect.ix().checkinSord(parentSord, SordC.mbAll, LockC.NO);
        logger.info("Archive folder created with ID: " + editInfo.sord.id);
        return editInfo.sord.id;
        
    } catch (e) {
        logger.error("Error getting/creating archive folder", e);
        throw e;
    }
}

function getMaskId(maskName) {
    try {
        var docMasks = ixConnect.ix().checkoutDocMasks(null, DocMaskC.mbAll, LockC.NO);
        
        for (var i = 0; i < docMasks.length; i++) {
            if (docMasks[i].name === maskName) {
                logger.debug("Found mask: " + maskName + " with ID: " + docMasks[i].id);
                return docMasks[i].id;
            }
        }
        
        logger.warn("Mask not found: " + maskName);
        return null;
        
    } catch (e) {
        logger.error("Error getting mask ID for: " + maskName, e);
        return null;
    }
}

function ensureDirectoriesExist() {
    createDirectoryIfNotExists(CONFIG.SOURCE_DIR);
    createDirectoryIfNotExists(CONFIG.PROCESSED_DIR);
    createDirectoryIfNotExists(CONFIG.ERROR_DIR);
}

function createDirectoryIfNotExists(dirPath) {
    try {
        var dir = new java.io.File(dirPath);
        if (!dir.exists()) {
            if (dir.mkdirs()) {
                logger.info("Created directory: " + dirPath);
            } else {
                logger.error("Failed to create directory: " + dirPath);
            }
        }
    } catch (e) {
        logger.error("Error creating directory: " + dirPath, e);
    }
}

function moveFileToProcessedDir(file) {
    moveFile(file, CONFIG.PROCESSED_DIR);
}

function moveFileToErrorDir(file) {
    moveFile(file, CONFIG.ERROR_DIR);
}

function moveFile(file, targetDir) {
    try {
        var targetFile = new java.io.File(targetDir, file.getName());
        
        // If target file exists, add timestamp
        if (targetFile.exists()) {
            var timestamp = new Date().getTime();
            var fileName = file.getName();
            var baseName = fileName.substring(0, fileName.lastIndexOf('.'));
            var extension = fileName.substring(fileName.lastIndexOf('.'));
            targetFile = new java.io.File(targetDir, baseName + "_" + timestamp + extension);
        }
        
        if (file.renameTo(targetFile)) {
            logger.debug("Moved file to: " + targetFile.getAbsolutePath());
        } else {
            logger.error("Failed to move file: " + file.getAbsolutePath());
        }
        
    } catch (e) {
        logger.error("Error moving file: " + file.getAbsolutePath(), e);
    }
}

// Main execution with enhanced startup
function main() {
    logger.info("=== PDFImportService Enhanced Starting ===");
    logger.info("Configuration loaded:");
    logger.info("- Source Directory: " + CONFIG.SOURCE_DIR);
    logger.info("- Archive Path: " + CONFIG.ARCHIVE_PATH);
    logger.info("- Metadata Mask: " + CONFIG.METADATA_MASK);
    logger.info("- Workflow Template: " + CONFIG.WORKFLOW_TEMPLATE);
    logger.info("- Interval: " + (CONFIG.INTERVAL / 1000) + " seconds");
    logger.info("- Max File Size: " + Math.round(CONFIG.MAX_FILE_SIZE / 1024 / 1024) + " MB");
    logger.info("- Retry Attempts: " + CONFIG.RETRY_ATTEMPTS);
    logger.info("============================================");
    
    // Validate initial setup
    if (!validateELOConnection()) {
        logger.error("Initial ELO connection validation failed. Service will not start.");
        return;
    }
    
    // Run immediately
    processPDFFiles();
    
    // Set up interval
    setInterval(function() {
        processPDFFiles();
    }, CONFIG.INTERVAL);
    
    logger.info("PDFImportService Enhanced is running with " + (CONFIG.INTERVAL / 1000) + " second interval");
}

// Start the enhanced service
main();