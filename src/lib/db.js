import Dexie from 'dexie'

const db = new Dexie('simple-planner')

db.version(1).stores({
  tracks: '++id, updatedAt',
})

export default db
