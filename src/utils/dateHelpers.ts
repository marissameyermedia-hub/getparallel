/**
 * Date helper functions for Parallel dating app
 */

/**
 * Calculate age from date of birth
 * @param dateOfBirth - Date of birth in format YYYY-MM-DD
 * @returns Age in years
 */
export function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust age if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Validate date of birth is at least 18 years old
 * @param dateOfBirth - Date of birth in format YYYY-MM-DD
 * @returns true if at least 18 years old, false otherwise
 */
export function isAtLeast18(dateOfBirth: string): boolean {
  return calculateAge(dateOfBirth) >= 18;
}

/**
 * Format date of birth for display
 * @param dateOfBirth - Date of birth in format YYYY-MM-DD
 * @returns Formatted date string (e.g., "January 15, 1995")
 */
export function formatDateOfBirth(dateOfBirth: string): string {
  const date = new Date(dateOfBirth);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}
