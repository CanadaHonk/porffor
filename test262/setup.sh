#!/bin/sh

old="$(pwd)"
dir="$(dirname "$(realpath "$0")")"/
cd "$dir"

git clone --depth=1 https://github.com/tc39/test262.git test262
npm install

cd "$old"