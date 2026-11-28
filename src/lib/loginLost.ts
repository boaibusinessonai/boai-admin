/** The request carried no usable login: an expired token (PGRST3xx), or none at all, so the database saw the public role (42501, "permission denied for schema admin"). */
export const loginLost = (status: number, code?: string) => status === 401 && Boolean(code?.startsWith('PGRST3') || code === '42501')
