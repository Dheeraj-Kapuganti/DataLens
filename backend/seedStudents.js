
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const client = new MongoClient(process.env.MONGODB_URI)

const departments = [
  'Computer Science',
  'Information Technology',
  'Electronics',
  'Mechanical',
  'Civil',
]

const cities = [
  'Hyderabad',
  'Bengaluru',
  'Chennai',
  'Mumbai',
  'Delhi',
  'Pune',
  'Jaipur',
]

async function seedStudents() {
  try {
    await client.connect()

    const db = client.db('datalens')
    const students = db.collection('students')

    await students.deleteMany({ synthetic: true })

    const documents = Array.from({ length: 10000 }, (_, i) => ({
      studentId: `DL${String(i + 1).padStart(6, '0')}`,
      name: `Student ${i + 1}`,
      age: 18 + Math.floor(Math.random() * 8),
      department:
        departments[Math.floor(Math.random() * departments.length)],
      gpa: Number((5 + Math.random() * 5).toFixed(2)),
      city: cities[Math.floor(Math.random() * cities.length)],
      semester: 1 + Math.floor(Math.random() * 8),
      synthetic: true,
    }))

    const result = await students.insertMany(documents)

    console.log(`Inserted ${result.insertedCount} synthetic students`)
    console.log(`Total documents: ${await students.countDocuments()}`)
  } catch (error) {
    console.error('Seeding failed:', error.message)
  } finally {
    await client.close()
  }
}

seedStudents()
