const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// middleware برای لاگ کردن درخواست‌ها
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// کلید مخفی برای JWT
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// ایجاد اتصال به پایگاه داده
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
};

// تعریف مسیر پایه برای همه APIها
const BASE_PATH = '/konkor';

// Route برای صفحه اصلی
app.get(BASE_PATH + '/', (req, res) => {
  res.json({
    message: 'خوش آمدید به سیستم آزمون آنلاین',
    version: '1.0.0',
    endpoints: {
      health: BASE_PATH + '/api/health',
      testDB: BASE_PATH + '/api/test-db',
      login: BASE_PATH + '/api/teacher/login',
      dashboard: BASE_PATH + '/api/teacher/dashboard'
    },
    documentation: 'برای اطلاعات بیشتر به مستندات مراجعه کنید'
  });
});

// Route برای تست سلامت سرور
app.get(BASE_PATH + '/api/health', (req, res) => {
  console.log('درخواست سلامت دریافت شد');
  res.json({ 
    status: 'OK', 
    message: 'سرور فعال است',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Route برای تست اتصال به دیتابیس
app.get(BASE_PATH + '/api/test-db', async (req, res) => {
  console.log('تست اتصال به دیتابیس درخواست شد');
  
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('اتصال به دیتابیس موفقیت‌آمیز بود');
    
    const [rows] = await connection.execute('SELECT 1 as test');
    await connection.end();
    
    res.json({ 
      status: 'OK', 
      message: 'اتصال به دیتابیس موفقیت‌آمیز بود',
      data: rows
    });
  } catch (error) {
    console.error('خطا در اتصال به دیتابیس:', error.message);
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'خطا در اتصال به دیتابیس: ' + error.message
    });
  }
});

// Middleware برای احراز هویت
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('توکن دریافت شده:', token ? 'وجود دارد' : 'وجود ندارد');

    if (!token) {
        return res.status(401).json({ error: 'دسترسی غیرمجاز. توکن احراز هویت ارائه نشده است.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log('توکن معتبر است. کاربر:', decoded.userId);
        next();
    } catch (error) {
        console.error('خطا در بررسی توکن:', error.message);
        return res.status(403)..json({ error: 'توکن نامعتبر است.' });
    }
};

// Route برای دریافت اطلاعات دشبورد معلم
app.get(BASE_PATH + '/api/teacher/dashboard', authenticateToken, async (req, res) => {
    const teacherId = req.user.userId;
    console.log('درخواست دشبورد برای معلم:', teacherId);

    try {
        // ایجاد اتصال به پایگاه داده
        const connection = await mysql.createConnection(dbConfig);
        console.log('اتصال به دیتابیس برقرار شد');

        // دریافت اطلاعات معلم
        const [teacherRows] = await connection.execute(
            'SELECT fullname FROM users WHERE id = ? AND role = "teacher"',
            [teacherId]
        );

        if (teacherRows.length === 0) {
            await connection.end();
            console.log('معلم یافت نشد با ID:', teacherId);
            return res.status(404).json({ error: 'معلم یافت نشد.' });
        }

        const fullname = teacherRows[0].fullname;
        console.log('معلم یافت شد:', fullname);

        // دریافت اطلاعات آزمون‌ها
        const [examRows] = await connection.execute(
            'SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC',
            [teacherId]
        );
        console.log('تعداد آزمون‌های یافت شده:', examRows.length);

        // دریافت آمار آزمون‌های فعال
        const [activeRows] = await connection.execute(
            `SELECT COUNT(DISTINCT exam_id) as active_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'pending'`,
            [teacherId]
        );
        console.log('آزمون‌های فعال:', activeRows[0].active_exams);

        // دریافت آمار آزمون‌های تکمیل شده
        const [completedRows] = await connection.execute(
            `SELECT COUNT(DISTINCT exam_id) as completed_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'completed'`,
            [teacherId]
        );
        console.log('آزمون‌های تکمیل شده:', completedRows[0].completed_exams);

        await connection.end();

        const recentExams = examRows.slice(0, 3).map(exam => ({
            id: exam.id,
            title: exam.title,
            description: exam.description,
            time_limit: exam.time_limit,
            created_at: exam.created_at
        }));

        // پاسخ به کلاینت
        const responseData = {
            fullname,
            total_exams: examRows.length,
            active_exams: activeRows[0].active_exams,
            completed_exams: completedRows[0].completed_exams,
            recent_exams: recentExams
        };
        
        console.log('ارسال پاسخ با داده‌های دشبورد');
        res.json(responseData);

    } catch (error) {
        console.error('خطا در دریافت اطلاعات دشبورد:', error.message);
        res.status(500).json({ 
            error: 'خطای سرور در دریافت اطلاعات',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Route برای لاگین
app.post(BASE_PATH + '/api/teacher/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('درخواست لاگین برای کاربر:', username);

    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('اتصال به دیتابیس برای لاگین برقرار شد');

        // بررسی اعتبار کاربر
        const [userRows] = await connection.execute(
            'SELECT id, fullname FROM users WHERE username = ? AND password = ? AND role = "teacher"',
            [username, password]
        );

        await connection.end();

        if (userRows.length === 0) {
            console.log('احراز هویت ناموفق برای کاربر:', username);
            return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
        }

        const user = userRows[0];
        console.log('احراز هویت موفق برای کاربر:', user.fullname);

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
        console.error('خطا در ورود:', error.message);
        res.status(500).json({ 
            error: 'خطای سرور در ورود به سیستم',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// middleware برای مسیرهای پیدا نشده
app.use('*', (req, res) => {
  console.log('مسیر یافت نشد:', req.originalUrl);
  res.status(404).json({ error: 'مسیر یافت نشد' });
});

// middleware برای مدیریت خطاهای全局
app.use((error, req, res, next) => {
  console.error('خطای سرور:', error.message);
  res.status(500).json({ 
    error: 'خطای داخلی سرور',
    message: process.env.NODE_ENV === 'development' ? error.message : 'لطفاً بعداً تلاش کنید'
  });
});

// راه اندازی سرور
app.listen(PORT, () => {
    console.log(`سرور در حال اجرا روی پورت ${PORT}`);
    console.log('مسیر پایه:', BASE_PATH);
    console.log('متغیرهای محیطی:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        hasPassword: !!process.env.DB_PASSWORD,
        nodeEnv: process.env.NODE_ENV
    });
});
