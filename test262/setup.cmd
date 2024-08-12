@echo off

set scriptDir=%~dp0
pushd %scriptDir%

git clone --depth=1 https://github.com/tc39/test262.git test262
npm install

popd