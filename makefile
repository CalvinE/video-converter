# non nvidia enabled container
build-docker-image:
	docker image rm -f cechols/video-converter:1
	docker image build --file .\Dockerfile --tag cechols/video-converter:1 .

run-docker-container:
	docker run -it --gpus all --volume F:/source:/source --volume D:/result:/result --volume D:/logs:/root/video-converter/logs cechols/video-converter:1

# nvidia enabled container
build-nvidia-enabled-docker-image:
	docker image rm -f cechols/video-converter:nvidia-1
	docker image build --file .\Dockerfile-nvidia --tag cechols/video-converter:nvidia-1 .

run-nvidia-enabled-docker-container:
	docker run -it --gpus all --volume F:/source:/source --volume D:/result:/result --volume D:/logs:/root/video-converter/logs cechols/video-converter:nvidia-1