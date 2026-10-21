/**
 * Most common disposable / temporary email domains (compact list). Blocking
 * them protects the one-free-trial-per-email rule without SMS verification.
 * Subdomains of a listed domain are blocked too.
 */
export const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '10minemail.com', '20minutemail.com', '30minutemail.com',
  '33mail.com', 'anonaddy.me', 'anonbox.net', 'armyspy.com', 'binkmail.com', 'bobmail.info', 'boximail.com',
  'burnermail.io', 'byom.de', 'chacuo.net', 'cool.fr.nf', 'courriel.fr.nf', 'crazymailing.com', 'cuvox.de',
  'dayrep.com', 'deadaddress.com', 'despam.it', 'devnullmail.com', 'discard.email', 'discardmail.com',
  'discardmail.de', 'dispostable.com', 'dodgit.com', 'dropmail.me', 'e4ward.com', 'einrot.com', 'emailondeck.com',
  'emailfake.com', 'emailtemporanea.com', 'emailtemporanea.net', 'emailtemporario.com.br', 'emltmp.com', 'emlhub.com',
  'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com', 'fastacura.com', 'filzmail.com', 'fleckens.hu',
  'getairmail.com', 'getnada.com', 'gishpuppy.com', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'gustr.com',
  'harakirimail.com', 'hidemail.de', 'hmamail.com', 'incognitomail.org', 'inboxbear.com', 'inboxkitten.com',
  'jetable.fr.nf', 'jetable.org', 'jourrapide.com', 'kasmail.com', 'kurzepost.de', 'letthemeatspam.com', 'lhsdv.com',
  'linshiyouxiang.net', 'mail-temp.com', 'mail.tm', 'mail7.io', 'mailcatch.com', 'maildrop.cc', 'mailexpire.com',
  'mailforspam.com', 'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailmoat.com', 'mailnesia.com',
  'mailnull.com', 'mailpoof.com', 'mailsac.com', 'mailtemp.info', 'mailtothis.com', 'meltmail.com', 'minutemail.com',
  'mintemail.com', 'moakt.com', 'moakt.cc', 'mohmal.com', 'mt2015.com', 'mvrht.com', 'mytemp.email', 'mytrashmail.com',
  'nada.email', 'nomail.xl.cx', 'nospam.ze.tc', 'nowmymail.com', 'objectmail.com', 'one-time.email', 'oneoffemail.com',
  'owlymail.com', 'pokemail.net', 'proxymail.eu', 'rcpt.at', 'rhyta.com', 'rppkn.com', 'sharklasers.com',
  'shieldemail.com', 'smashmail.de', 'snapmail.cc', 'sofimail.com', 'spam4.me', 'spambog.com', 'spambox.us',
  'spamdecoy.net', 'spamex.com', 'spamfree24.org', 'spamgourmet.com', 'spamhole.com', 'spaml.de', 'spammotel.com',
  'spamspot.com', 'superrito.com', 'suremail.info', 'teleworm.us', 'temp-mail.io', 'temp-mail.org', 'temp-mail.ru',
  'tempail.com', 'tempemail.co', 'tempemail.net', 'tempinbox.com', 'tempmail.com', 'tempmail.de', 'tempmail.dev',
  'tempmail.net', 'tempmail.plus', 'tempmailaddress.com', 'tempmailo.com', 'tempr.email', 'thankyou2010.com',
  'throwam.com', 'throwawaymail.com', 'tmail.ws', 'tmails.net', 'tmpmail.net', 'tmpmail.org', 'trash-mail.com',
  'trashmail.at', 'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net', 'trashmail.ws', 'trbvm.com',
  'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'zetmail.com',
  'zoemail.org', 'emailnax.com', 'tempmailbox.net', 'luxusmail.org', 'internxt.com', 'cyclelove.cc', 'vintomaper.com',
]);

/** True for listed domains and any of their subdomains. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (!domain) return false;
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
