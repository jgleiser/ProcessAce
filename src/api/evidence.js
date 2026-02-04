const express = require('express');
const multer = require('multer');
const path = require('path');
const { saveEvidence, Evidence } = require('../models/evidence');
const { evidenceQueue } = require('../services/queueInstance');

const router = express.Router();

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Initialize JobQueue (ideally simulated dependency injection)
// const evidenceQueue = new JobQueue('evidence-queue'); // REPLACED WITH SINGLETON

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // 1. Create Evidence record
        const evidence = new Evidence({
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
        });

        await saveEvidence(evidence);

        // 2. Enqueue Job
        const job = await evidenceQueue.add('process_evidence', {
            evidenceId: evidence.id,
            filename: evidence.filename
        });

        res.status(202).json({
            message: 'Upload accepted',
            evidenceId: evidence.id,
            jobId: job.id,
            statusUrl: `/api/jobs/${job.id}` // Placeholder URL
        });

    } catch (err) {
        req.log.error({ err }, 'Upload failed');
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Expose queue instance for worker registration (hacky for Phase 1)
// router.queue = evidenceQueue; // REMOVED

module.exports = router;
