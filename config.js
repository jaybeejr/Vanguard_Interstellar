/* The website's settings. This is the only file you edit to turn on the Discord bot.

   verifyApi: the address of your account service (the Cloudflare Worker in the discord-bot folder),
              like 'https://vanguard-verify.yourname.workers.dev' with NO slash at the end.
              When this is filled in, people create accounts with /register in Discord and sign in
              with a code from /login. There are no passwords.
              When it is empty, the site uses simple username + password accounts saved in each browser.

   adminUsers: the usernames allowed into admin.html. Add or remove names here (not case sensitive).

   discordClientId: only used when verifyApi is empty. Lets people sign in with a Discord login button.
              Paste the Client ID (never the Client Secret). */
window.VANGUARD_CONFIG = {
  verifyApi: 'https://vanguard-verify.jakeylongnose.workers.dev/',
  adminUsers: ['JayBeeJR', 'Stormbryngr'],
  discordClientId: ''
};
