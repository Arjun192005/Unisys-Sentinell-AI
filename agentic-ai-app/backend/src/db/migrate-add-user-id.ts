/**
 * Migration: Add user_id column to sessions table
 * 
 * This migration adds user_id to existing sessions.
 * Since we can't determine the original owner, we'll assign all existing
 * sessions to user_id = 1 (admin). Users should create new sessions after this.
 */

import { getDb } from './database';

export function migrateAddUserId() {
  const db = getDb();
  
  try {
    // Check if user_id column already exists
    const stmt = db.prepare('PRAGMA table_info(sessions)');
    const columns: any[] = [];
    
    while (stmt.step()) {
      columns.push(stmt.getAsObject());
    }
    stmt.free();
    
    if (columns.length === 0) {
      console.log('[Migration] Sessions table not found, skipping migration');
      return;
    }
    
    const hasUserId = columns.some((col: any) => col.name === 'user_id');
    
    if (hasUserId) {
      console.log('[Migration] user_id column already exists, skipping migration');
      return;
    }
    
    console.log('[Migration] Adding user_id column to sessions table...');
    
    // Add user_id column with default value 1 (admin)
    db.run('ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1');
    
    console.log('[Migration] ✅ Successfully added user_id column');
    console.log('[Migration] ⚠️  All existing sessions assigned to user_id = 1 (admin)');
    console.log('[Migration] ℹ️  Users should create new sessions for proper ownership');
    
  } catch (error) {
    console.error('[Migration] ❌ Failed to add user_id column:', error);
    throw error;
  }
}
