image_name = cechols/video-converter
version = 1.0.3
nvidia_tag = -nvidia

# non nvidia enabled container
build-docker-image:
	docker image rm -f $(image_name):$(version)
	docker image build --file .\Dockerfile --tag $(image_name):$(version) .

run-docker-container:
	docker run -it --volume D:/source:/source --volume D:/result/cpu:/result --volume D:/video-converter-data:/root/video-converter/output $(image_name):$(version)

test-docker-container: build-docker-image run-docker-container

# nvidia enabled container
build-nvidia-enabled-docker-image:
	docker image rm -f $(image_name):$(version)$(nvidia_tag)
	docker image build --file .\Dockerfile-nvidia --tag $(image_name):$(version)$(nvidia_tag) .

run-nvidia-enabled-docker-container:
	docker run -it --gpus all --volume D:/source:/source --volume D:/result/nvidia:/result --volume D:/video-converter-data:/root/video-converter/output $(image_name):$(version)$(nvidia_tag)

test-nvidia-enabled-docker-container: build-nvidia-enabled-docker-image	run-nvidia-enabled-docker-container