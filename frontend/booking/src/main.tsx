/**
 * Entry of /b/booking.js — serves the profile and team pages (/<slug>), the manage
 * page (/c/<token>) and the waitlist leave page (/w/<token>); the last two are
 * lazily loaded.
 */
import { render } from 'preact';
import './styles.css';
import { BookingApp } from './booking/BookingApp';
import { initAnalytics, trackPageView } from './lib/analytics';
import {
  createRuntime, manageTokenFromLocation, readEmbeddedData, slugFromLocation, waitlistTokenFromLocation, withMockPage,
} from './lib/bootstrap';

async function start(root: HTMLElement): Promise<void> {
  const slug = slugFromLocation();
  const { profile, team, config } = await withMockPage(readEmbeddedData(), slug);
  const runtime = await createRuntime(config);
  const waitToken = waitlistTokenFromLocation();
  if (waitToken) {
    const { LeaveWaitlist } = await import('./manage/LeaveWaitlist');
    render(<LeaveWaitlist token={waitToken} api={runtime.api} />, root);
    return;
  }
  const token = manageTokenFromLocation();
  if (token) {
    const { ManageApp } = await import('./manage/ManageApp');
    render(<ManageApp token={token} api={runtime.api} />, root);
    return;
  }
  render(<BookingApp slug={team?.slug ?? profile?.slug ?? slug} initialProfile={profile} team={team} runtime={runtime} />, root);
}

initAnalytics();
trackPageView();

const root = document.getElementById('app');
if (root) void start(root);
