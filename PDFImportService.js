/**
 * ELO AS (Automation Services) Script for PDF Import
 * Imports PDF files from filesystem to ELO Archive with metadata mask "Eingangsrechnung"
 * and starts workflow with template "dps.invoice.Base"
 * 
 * Runs every 30 seconds
 */

// Configuration
var CONFIG = {
    // Source directory for PDF files
    SOURCE_DIR: "C:\\temp\\pdf_import",
    
    // Archive path in ELO
    ARCHIVE_PATH: "¶Eingangsrechnungen",
    
    // Metadata mask name
    METADATA_MASK: "Eingangsrechnung",
    
    // Workflow template
    WORKFLOW_TEMPLATE: "dps.invoice.Base",
    
    // Processed files directory
    PROCESSED_DIR: "C:\\temp\\pdf_import\\processed",
    
    // Error files directory
    ERROR_DIR: "C:\\temp\\pdf_import\\error",
    
    // Interval in milliseconds (30 seconds)
    INTERVAL: 30000
};

// Global variables
var logger = sol.create("sol.Logger", { scope: "PDFImportService" });
var fileUtils = sol.create("sol.common.FileUtils");

/**
 * Main function that processes PDF files
 */
function processPDFFiles() {
    try {
        logger.info("Starting PDF import process...");
        
        // Ensure directories exist
        ensureDirectoriesExist();
        
        // Get list of PDF files in source directory
        var pdfFiles = getPDFFiles(CONFIG.SOURCE_DIR);
        
        if (pdfFiles.length === 0) {
            logger.debug("No PDF files found in source directory");
            return;
        }
        
        logger.info("Found " + pdfFiles.length + " PDF files to process");
        
        // Process each PDF file
        for (var i = 0; i < pdfFiles.length; i++) {
            try {
                processSinglePDF(pdfFiles[i]);
            } catch (e) {
                logger.error("Error processing file: " + pdfFiles[i].getName(), e);
                moveFileToErrorDir(pdfFiles[i]);
            }
        }
        
        logger.info("PDF import process completed");
        
    } catch (e) {
        logger.error("Error in processPDFFiles", e);
    }
}

/**
 * Process a single PDF file
 * @param {File} pdfFile - The PDF file to process
 */
function processSinglePDF(pdfFile) {
    logger.info("Processing file: " + pdfFile.getName());
    
    // Import file to ELO
    var sordId = importFileToELO(pdfFile);
    
    if (sordId) {
        // Start workflow
        startWorkflow(sordId);
        
        // Move file to processed directory
        moveFileToProcessedDir(pdfFile);
        
        logger.info("Successfully processed file: " + pdfFile.getName() + " (Sord ID: " + sordId + ")");
    } else {
        throw new Error("Failed to import file to ELO");
    }
}

/**
 * Import PDF file to ELO Archive
 * @param {File} pdfFile - The PDF file to import
 * @return {String} - The Sord ID of the imported document
 */
function importFileToELO(pdfFile) {
    try {
        // Get parent folder ID
        var parentId = getOrCreateArchiveFolder();
        
        // Create new Sord
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
        
        // Set document type
        sord.type = SordC.LBT_DOCUMENT;
        
        // Check in the Sord
        var editInfo = ixConnect.ix().checkinSord(sord, SordC.mbAll, LockC.NO);
        var sordId = editInfo.sord.id;
        
        // Upload the PDF file
        var docVersion = new DocVersion();
        docVersion.comment = "Imported by PDFImportService";
        docVersion.version = "1.0";
        
        var document = ixConnect.ix().checkinDocBegin(sordId);
        document.docs[0].version = docVersion;
        
        // Upload file content
        var fileData = fileUtils.readFileToByteArray(pdfFile.getAbsolutePath());
        var uploadResult = ixConnect.upload(fileData, document.docs[0].url);
        
        if (uploadResult) {
            ixConnect.ix().checkinDocEnd(sordId, SordC.mbAll, document);
            return sordId;
        } else {
            throw new Error("Failed to upload file content");
        }
        
    } catch (e) {
        logger.error("Error importing file to ELO: " + pdfFile.getName(), e);
        throw e;
    }
}

/**
 * Start workflow on the imported document
 * @param {String} sordId - The Sord ID of the document
 */
function startWorkflow(sordId) {
    try {
        logger.info("Starting workflow for Sord ID: " + sordId);
        
        // Get workflow template
        var wfTemplate = ixConnect.ix().checkoutWorkFlow(CONFIG.WORKFLOW_TEMPLATE, WFTypeC.TEMPLATE, WFDiagramC.mbAll, LockC.NO);
        
        if (!wfTemplate) {
            throw new Error("Workflow template not found: " + CONFIG.WORKFLOW_TEMPLATE);
        }
        
        // Create workflow instance
        var wfInstance = ixConnect.ix().createWorkFlow(wfTemplate, sordId);
        
        // Start the workflow
        ixConnect.ix().startWorkFlow(wfInstance.id, "");
        
        logger.info("Workflow started successfully for Sord ID: " + sordId);
        
    } catch (e) {
        logger.error("Error starting workflow for Sord ID: " + sordId, e);
        throw e;
    }
}

/**
 * Get or create the archive folder
 * @return {String} - The folder ID
 */
function getOrCreateArchiveFolder() {
    try {
        // Try to find existing folder
        var findInfo = new FindInfo();
        findInfo.findByIndex = new FindByIndex();
        findInfo.findByIndex.name = CONFIG.ARCHIVE_PATH;
        
        var findResult = ixConnect.ix().findFirstSords(findInfo, 1, SordC.mbAll);
        
        if (findResult.sords && findResult.sords.length > 0) {
            return findResult.sords[0].id;
        }
        
        // Create folder if it doesn't exist
        var parentSord = ixConnect.ix().createSord("1", null, EditInfoC.mbSord).sord;
        parentSord.name = CONFIG.ARCHIVE_PATH.substring(1); // Remove ¶ prefix
        parentSord.type = SordC.LBT_FOLDER;
        
        var editInfo = ixConnect.ix().checkinSord(parentSord, SordC.mbAll, LockC.NO);
        return editInfo.sord.id;
        
    } catch (e) {
        logger.error("Error getting/creating archive folder", e);
        throw e;
    }
}

/**
 * Get mask ID by name
 * @param {String} maskName - The mask name
 * @return {String} - The mask ID
 */
function getMaskId(maskName) {
    try {
        var docMasks = ixConnect.ix().checkoutDocMasks(null, DocMaskC.mbAll, LockC.NO);
        
        for (var i = 0; i < docMasks.length; i++) {
            if (docMasks[i].name === maskName) {
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

/**
 * Get list of PDF files from directory
 * @param {String} dirPath - Directory path
 * @return {Array} - Array of File objects
 */
function getPDFFiles(dirPath) {
    var pdfFiles = [];
    
    try {
        var dir = new java.io.File(dirPath);
        
        if (!dir.exists() || !dir.isDirectory()) {
            logger.warn("Source directory does not exist: " + dirPath);
            return pdfFiles;
        }
        
        var files = dir.listFiles();
        
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.isFile() && file.getName().toLowerCase().endsWith(".pdf")) {
                pdfFiles.push(file);
            }
        }
        
    } catch (e) {
        logger.error("Error reading PDF files from directory: " + dirPath, e);
    }
    
    return pdfFiles;
}

/**
 * Ensure required directories exist
 */
function ensureDirectoriesExist() {
    createDirectoryIfNotExists(CONFIG.SOURCE_DIR);
    createDirectoryIfNotExists(CONFIG.PROCESSED_DIR);
    createDirectoryIfNotExists(CONFIG.ERROR_DIR);
}

/**
 * Create directory if it doesn't exist
 * @param {String} dirPath - Directory path
 */
function createDirectoryIfNotExists(dirPath) {
    try {
        var dir = new java.io.File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
            logger.info("Created directory: " + dirPath);
        }
    } catch (e) {
        logger.error("Error creating directory: " + dirPath, e);
    }
}

/**
 * Move file to processed directory
 * @param {File} file - The file to move
 */
function moveFileToProcessedDir(file) {
    moveFile(file, CONFIG.PROCESSED_DIR);
}

/**
 * Move file to error directory
 * @param {File} file - The file to move
 */
function moveFileToErrorDir(file) {
    moveFile(file, CONFIG.ERROR_DIR);
}

/**
 * Move file to specified directory
 * @param {File} file - The file to move
 * @param {String} targetDir - Target directory
 */
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
            logger.info("Moved file to: " + targetFile.getAbsolutePath());
        } else {
            logger.error("Failed to move file: " + file.getAbsolutePath());
        }
        
    } catch (e) {
        logger.error("Error moving file: " + file.getAbsolutePath(), e);
    }
}

// Main execution - set up interval
function main() {
    logger.info("PDFImportService started with " + (CONFIG.INTERVAL / 1000) + " second interval");
    
    // Run immediately
    processPDFFiles();
    
    // Set up interval
    setInterval(function() {
        processPDFFiles();
    }, CONFIG.INTERVAL);
}

// Start the service
main();