import { redirect } from 'next/navigation';

// The portal has just two pages — tasks from the Web SEO managers and the daily EOD.
export default function WebDeveloperHome() {
  redirect('/web-developer/tasks');
}
