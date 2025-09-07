const { executeQuery } = require('../config/database');
const jwt = require('jsonwebtoken');
const jalaali = require('jalaali-js');

// تبدیل تاریخ به شمسی
function toJalaali(date) {
    const gregorianDate = new Date(date);
    const jalaaliDate = jalaali.toJalaali(
        gregorianDate.getFullYear(),
        gregorianDate.getMonth() + 1,
        gregorianDate.getDate()
    );
    return `${jalaaliDate.jy}/${jalaaliDate.jm}/${jalaaliDate.jd} ${gregorianDate.getHours()}:${gregorianDate.getMinutes()}`;
}

// دریافت اطلاعات دشبورد معلم
exports.getDashboard = async (req, res) => {
    try {
        const teacherId = req.user.userId;

        // دریافت اطلاعات آزمون‌ها
        const exams = await executeQuery(
            'SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC',
            [teacherId]
        );

        // تبدیل تاریخ‌ها به شمسی
        exams.forEach(exam => {
            exam.created_at_sh = exam.created_at ? toJalaali(exam.created_at) : '';
        });

        // آمار آزمون‌های فعال
        const [activeResult] = await executeQuery(
            `SELECT COUNT(DISTINCT exam_id) as active_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'pending'`,
            [teacherId]
        );

        // آمار آزمون‌های تکمیل شده
        const [completedResult] = await executeQuery(
            `SELECT COUNT(DISTINCT exam_id) as completed_exams 
             FROM assigned_exams 
             WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = ?) 
             AND status = 'completed'`,
            [teacherId]
        );

        res.json({
            success: true,
            data: {
                fullname: req.user.fullname,
                exams: exams,
                activeExams: activeResult.active_exams,
                completedExams: completedResult.completed_exams
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطا در دریافت اطلاعات از سرور' 
        });
    }
};

// لاگین معلم
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // بررسی کاربر در دیتابیس
        const users = await executeQuery(
            'SELECT * FROM users WHERE username = ? AND role = "teacher"',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'نام کاربری یا رمز عبور اشتباه است' 
            });
        }

        const user = users[0];

        // بررسی رمز عبور (فرض می‌کنیم رمزها hashed هستند)
        // const isPasswordValid = await bcrypt.compare(password, user.password);
        // برای شروع، می‌توانید مقایسه ساده انجام دهید:
        const isPasswordValid = password === user.password;

        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'نام کاربری یا رمز عبور اشتباه است' 
            });
        }

        // ایجاد JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username, 
                role: user.role, 
                fullname: user.fullname 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                fullname: user.fullname,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطا در سرور' 
        });
    }
};

// ایجاد آزمون جدید
exports.createExam = async (req, res) => {
    try {
        const { title, description, time_limit, questions } = req.body;
        const teacherId = req.user.userId;

        const result = await executeQuery(
            'INSERT INTO exams (teacher_id, title, description, time_limit) VALUES (?, ?, ?, ?)',
            [teacherId, title, description, time_limit]
        );

        res.json({
            success: true,
            examId: result.insertId,
            message: 'آزمون با موفقیت ایجاد شد'
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطا در ایجاد آزمون' 
        });
    }
};
