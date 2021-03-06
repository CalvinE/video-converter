FROM jrottenberg/ffmpeg:5-ubuntu

VOLUME [ "/source" ]

VOLUME [ "/result" ]

VOLUME [ "/root/video-converter/output" ]

# eww I know gross...
WORKDIR /root

RUN apt update

RUN apt install -y wget

RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

SHELL ["/bin/bash", "--login", "-i", "-c"]

RUN source /root/.bashrc

RUN nvm install 16.14.2

COPY . /root/video-converter

WORKDIR /root/video-converter

RUN npm install

RUN npm run build


ENTRYPOINT []
# node .\build\index.js --targetFileNameRegex .*\.mp4 --convertVideo --sourcePath "F:\Bob's Burgers\Bob's Burgers Season 1" --targetVideoEncoder libx265 --copyRelativeFolderPath --savePath ".\oother-test"
CMD [ "/root/.nvm/versions/node/v16.14.2/bin/node", "./build/index.js", "--convertVideo", "--sourcePath", "/source", "--targetVideoEncoder", "libx265", "--copyRelativeFolderPath", "--savePath", "/result", "--fileCopyExtensions", ".jpg,.srt" ]
