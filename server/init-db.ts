import { storage } from "./storage";

export async function initializeDatabase() {
  try {
    // Check if admin user exists
    const existingUser = await storage.getUserByUsername("agent.smith");
    
    if (!existingUser) {
      // Create default admin user
      await storage.createUser({
        username: "agent.smith",
        password: "password123",
        name: "Agent J. Smith",
        clearanceLevel: "Level 3 - Confidential"
      });
      console.log("Default admin user created: agent.smith");
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}