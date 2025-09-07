const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'exam_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// تابع برای گرفتن connection
async function getConnection() {
    return await pool.getConnection();
}

// تابع برای اجرای query
async function executeQuery(sql, params = []) {
    let connection;
    try {
        connection = await getConnection();
        const [results] = await connection.execute(sql, params);
        return results;
    } catch (error) {
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    pool,
    getConnection,
    executeQuery
};
