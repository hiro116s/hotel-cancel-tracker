# Ubuntu setup

# Install Dependencies
sudo apt update
sudo apt install -y libatk1.0-0 ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
# Install Japanese fonts
sudo apt install -y fonts-ipafont-gothic fonts-ipafont-mincho

# Install nodejs
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install node

# Build project
echo -e "Host github.com\n\tStrictHostKeyChecking no\n" >> ~/.ssh/config
git clone git@github.com:hiro116s/hotel-cancel-tracker.git
cd hotel-cancel-tracker
npm install
sed -e "s|CHANNEL_ACCESS_TOKEN|<<copy_your_channel_coken>>|g" -i config.json

# Run task
npm start run
