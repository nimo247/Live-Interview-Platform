export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript', extension: 'js' },
  { value: 'typescript', label: 'TypeScript', extension: 'ts' },
  { value: 'python', label: 'Python', extension: 'py' },
  { value: 'java', label: 'Java', extension: 'java' },
  { value: 'cpp', label: 'C++', extension: 'cpp' },
  { value: 'go', label: 'Go', extension: 'go' },
] as const

export interface RunResult {
  stdout: string
  stderr: string
  compile_output: string
  status: string
  time: string | null
  memory: number | null
  error: string
}

export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase()
  return /^[A-Z0-9]{8}$/.test(code) ? code : null
}

export async function roomRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(BACKEND_URL + '/rooms/' + path, {
      method: 'POST',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    })
  } catch {
    throw new Error('The interview service is unavailable. Please try again in a moment.')
  }
  if (!response.ok) throw new Error('The request could not be completed. Please try again.')
  try { return await response.json() as T }
  catch { throw new Error('The interview service returned an unexpected response. Please try again.') }
}

export async function createRoom(): Promise<string> {
  const data = await roomRequest<{ room_id?: string }>('create')
  const roomId = typeof data.room_id === 'string' ? normalizeRoomCode(data.room_id) : null
  if (!roomId) throw new Error('A room could not be created. Please try again.')
  return roomId
}
