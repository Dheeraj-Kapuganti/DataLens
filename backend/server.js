
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { connectToDatabase, getMongoClient } from './config/database.js'
import queryRoutes from './routes/queryRoutes.js'
import indexAdvisorRoutes from './routes/indexAdvisorRoutes.js'
import benchmarkRoutes from './routes/benchmarkRoutes.js'
import connectionRoutes from './routes/connectionRoutes.js'
import schemaRoutes from './routes/schemaRoutes.js'
import authRoutes from './routes/authRoutes.js'

const app = express()

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing from .env')
}

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json())

app.use(
  session({
    name: 'datalens.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      client: getMongoClient(),
      dbName: 'datalens',
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 7,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
)
app.use('/api/auth', authRoutes)

app.use('/api', queryRoutes)
app.use('/api', indexAdvisorRoutes)
app.use('/api', benchmarkRoutes)
app.use('/api/connections', connectionRoutes)
app.use('/api', schemaRoutes)


app.get('/api/health', (req, res) => {
  res.json({ message: 'DataLens backend is running!' })
})

app.post('/api/test', (req, res) => {
  res.json({
    message: 'Data received successfully!',
    receivedData: req.body,
  })
})

app.get('/api/students', async (req, res) => {
  try {
    const { department } = req.query
    const filter = department ? { department } : {}

    const students = await req.app.locals.db
      .collection('students')
      .find(filter)
      .limit(10)
      .toArray()

    res.json(students)
  } catch (error) {
    console.error('Failed to fetch students:', error.message)
    res.status(500).json({ message: 'Failed to fetch students' })
  }
})

app.get('/api/students/explain', async (req, res) => {
  try {
    const result = await req.app.locals.db
      .collection('students')
      .find({ department: 'Computer Science' })
      .explain('executionStats')

    res.json(result)
  } catch (error) {
    console.error('Failed to explain query:', error.message)
    res.status(500).json({ message: 'Failed to explain query' })
  }
})

async function startServer() {
  try {
    const db = await connectToDatabase()
    app.locals.db = db

    app.listen(5000, () => {
      console.log('DataLens backend running on port 5000')
    })
  } catch (error) {
    console.error('Failed to start DataLens:', error.message)
    process.exit(1)
  }
}

startServer()
