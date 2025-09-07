const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getDashboard,
    login,
    createExam,
    getExamArchive,
    getStudentResults,
    assignExam
} = require('../controllers/teacherController');

// Public routes
router.post('/login', login);

// Protected routes (نیاز به توکن دارد)
router.get('/dashboard', authenticateToken, getDashboard);
router.post('/exams', authenticateToken, createExam);
router.get('/exams/archive', authenticateToken, getExamArchive);
router.get('/results', authenticateToken, getStudentResults);
router.post('/exams/assign', authenticateToken, assignExam);

module.exports = router;
