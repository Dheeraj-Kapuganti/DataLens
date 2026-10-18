
import { MongoClient } from 'mongodb'

const client = new MongoClient(process.env.MONGODB_URI)

export async function connectToDatabase() {
  await client.connect()

  const db = client.db('datalens')

  console.log('MongoDB connected successfully')

  return db
}

export function getMongoClient() {
  return client
}

export async function closeDatabaseConnection() {
  await client.close()
}
