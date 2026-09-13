const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadAndAnalyze, getMyReports, getReportById } = require('../controllers/userController');
const { exportPdf, exportExcel } = require('../controllers/exportController');

const router = express.Router();

router.post('/upload', protect, upload.single('image'), uploadAndAnalyze);
router.get('/export/pdf', protect, exportPdf);
router.get('/export/excel', protect, exportExcel);
router.get('/', protect, getMyReports);
router.get('/:id', protect, getReportById);

module.exports = router;
