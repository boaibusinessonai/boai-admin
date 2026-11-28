/**
 * BROKEN-43: a stage can have the newest Admin before its App part (an Admin-only move). An admin.* function that calls an
 * app function, table or schema only the App move brings then fails inside the database with "… does not exist"
 * (42883 function, 42P01 table, 3F000 schema). That is not a fault to show raw: the page says the part comes with the App move.
 * A missing admin.* function itself answers PGRST202 from the API, never these codes.
 */
export const WAITS_FOR_APP = 'This part arrives with the next App move to this stage.'

export const waitsForApp = (code?: string, message?: string) =>
  (code === '42883' || code === '42P01' || code === '3F000') && /^(function|relation|schema) .+ does not exist/.test(message ?? '')
