import Entry from '../../entry';
import { Role, ROLE_IDS, deskOf } from '../../team';
import { notFound } from 'next/navigation';
export default async function Login({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!ROLE_IDS.includes(role as Role)) notFound();
  return <Entry role={deskOf(role as Role)} />;
}
