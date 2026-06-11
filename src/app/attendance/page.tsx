import { getSession } from '@/lib/actions/auth';
import AttendanceClient from '@/components/attendance/AttendanceClient';

export default async function AttendancePage() {
  const session = await getSession();

  if (!session) return null;

  return <AttendanceClient session={session} />;
}
