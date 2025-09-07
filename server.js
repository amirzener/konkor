const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// کلید مخفی برای JWT (در محیط واقعی باید پیچیده و امن باشد)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ایجاد اتصال به پایگاه داده
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'online_exam_system',
    charset: 'utf8mb4'
};

// Middleware برای احراز هویت
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'دسترسی غیرمجاز. توکن احراز هویت ارائه نشده است.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'توکن نامعتبر است.' });
    }
};

// Route برای دریافت اطلاعات دشبورد معلم
app.get('/api/teacher/dashboard', authenticateToken, async (req, res) => {
    const teacherId = req.user.userId;

    try {
        // ایجاد اتصال به پایگاه داده
        const connection = await mysql.createConnection(dbConfig);

        // دریافت اطلاعات معلم
        const [teacherRows] = await connection.execute(
            'SELECT fullname FROM users WHERE id = ? AND role = "teacher"',
            [teacherId]
        );

        if (teacherRows.length === 0) {
            await connection.end();
            return res.status(404).json({ error: 'معلم یافت نشد.' });
        }

        const fullname = teacherRows[0].fullname;

        // دریافت اطلاعات آزمون‌ها
        const [examRows] = await connection.execute(
            'SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC',
            [teacherId]
        );

        // دریافت آمار آزمون‌های فعال
        const [activeRows] = await connection.execute(
            `SELECT COUNT(DISTINCT exam_id) as active_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'pending'`,
            [teacherId]
        );

        // دریافت آمار آزمون‌های تکمیل شده
        const [completedRows] = await connection.execute(
            `SELECT COUNT(DISTINCT exam_id) as completed_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'completed'`,
            [teacherId]
        );

        await connection.end();

        // تبدیل تاریخ‌ها به شمسی (اگر کتابخانه jdf در دسترس باشد)
        // در اینجا فقط تاریخ ایجاد را برمی‌گردانیم
        const recentExams = examRows.slice(0, 3).map(exam => ({
            id: exam.id,
            title: exam.title,
            description: exam.description,
            time_limit: exam.time_limit,
            created_at: exam.created_at
        }));

        // پاسخ به کلاینت
        res.json({
            fullname,
            total_exams: examRows.length,
            active_exams: activeRows[0].active_exams,
            completed_exams: completedRows[0].completed_exams,
            recent_exams: recentExams
        });

    } catch (error) {
        console.error('خطا در دریافت اطلاعات:', error);
        res.status(500).json({ error: 'خطای سرور در دریافت اطلاعات' });
    }
});

// Route برای لاگین (برای نمونه)
app.post('/api/teacher/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);

        // بررسی اعتبار کاربر
        const [userRows] = await connection.execute(
            'SELECT id, fullname FROM users WHERE username = ? AND password = ? AND role = "teacher"',
            [username, password] // در عمل باید از هش کردن رمز عبور استفاده شود
        );

        await connection.end();

        if (userRows.length === 0) {
            return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
        }

        const user = userRows[0];

        // ایجاد توکن JWT
        const token = jwt.sign(
            { userId: user.id, role: 'teacher' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                fullname: user.fullname,
                role: 'teacher'
            }
        });

    } catch (error) {
        console.error('خطا در ورود:', error);
        res.status(500).json({ error: 'خطای سرور در ورود به سیستم' });
    }
});

// Routeهای دیگر برای مدیریت آزمون‌ها، دانش‌آموزان و غیره...

// راه اندازی سرور
app.listen(PORT, () => {
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
});
