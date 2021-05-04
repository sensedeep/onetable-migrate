all: build

build:
	npm i --package-lock-only
	npm run build

publish: build
	npm publish

promote: publish

update:
	npm update dynamodb-onetable
	npm update onetable-migrate
	npm i --package-lock-only
