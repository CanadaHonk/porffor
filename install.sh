#!/bin/sh
# porffor installer (https://porffor.dev)
# usage:
#   curl -fsSL https://porffor.dev/install.sh | sh
#   curl -fsSL https://porffor.dev/install.sh | sh -s -- pre-alpha-1
set -eu

if [ -t 1 ]; then
  esc="$(printf '\033')"
  reset="${esc}[0m" red="${esc}[31m" green="${esc}[32m" dim="${esc}[2m" bold="${esc}[1m"
else
  reset='' red='' green='' dim='' bold=''
fi

error() {
  echo "${red}error${reset}: $1" >&2
  exit 1
}

tildify() {
  case "$1" in
    "$HOME"/*) echo "~${1#"$HOME"}" ;;
    *) echo "$1" ;;
  esac
}

if [ "${OS:-}" = "Windows_NT" ]; then
  error "please use WSL to install porffor on Windows"
fi

command -v curl >/dev/null || error "curl is required to install porffor"
command -v tar >/dev/null || error "tar is required to install porffor"

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) error "unsupported OS: $(uname -s)" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) error "unsupported architecture: $(uname -m)" ;;
esac

# running under rosetta: install the real (arm64) target
if [ "$os" = "darwin" ] && [ "$arch" = "x64" ] && \
   [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
  arch=arm64
fi

target="$os-$arch"
if [ "$os" = "linux" ] && [ -f /etc/alpine-release ]; then
  target="$target-musl"
fi

repo="https://github.com/CanadaHonk/porffor"
asset="porffor-$target.tar.gz"

if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  url="$repo/releases/download/$1/$asset"
else
  url="$repo/releases/latest/download/$asset"
fi

bin_dir="${PORFFOR_INSTALL:-$HOME/.local/bin}"
exe="$bin_dir/porf"
mkdir -p "$bin_dir"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "downloading ${dim}$url${reset}"
curl --fail --location --progress-bar --output "$tmp/$asset" "$url" ||
  error "failed to download porffor from $url"
tar -xzf "$tmp/$asset" -C "$tmp" ||
  error "failed to extract $asset"
chmod +x "$tmp/porf"
mv "$tmp/porf" "$exe"

version="$("$exe" --version 2>/dev/null)" ||
  error "installed binary failed to run"

echo
echo "${green}porffor $version was installed to $(tildify "$exe")${reset}"

resolved="$(command -v porf 2>/dev/null || true)"

on_path=false
case ":$PATH:" in
  *":$bin_dir:"*) on_path=true ;;
esac

if $on_path && [ "$resolved" = "$exe" ]; then
  echo "run '${bold}porf --help${reset}' to get started"
  exit 0
fi

if [ -n "$resolved" ] && [ "$resolved" != "$exe" ]; then
  echo "note: another porf at $(tildify "$resolved") currently takes precedence;"
  echo "putting $(tildify "$bin_dir") first in PATH"
fi

export_line="export PATH=\"$bin_dir:\$PATH\""
refresh="exec \$SHELL"
rc=''
case "$(basename "${SHELL:-}")" in
  zsh) rc="$HOME/.zshrc" ;;
  bash)
    for f in "$HOME/.bash_profile" "$HOME/.bashrc"; do
      if [ -f "$f" ]; then rc="$f"; break; fi
    done
    if [ -z "$rc" ]; then
      if [ "$os" = "darwin" ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
    fi
    ;;
  fish)
    rc="$HOME/.config/fish/config.fish"
    export_line="fish_add_path $bin_dir"
    refresh="source $(tildify "$rc")"
    ;;
esac

echo
if [ -z "$rc" ]; then
  echo "add $(tildify "$bin_dir") to your PATH:"
  refresh="$export_line"
elif grep -qs "$bin_dir" "$rc"; then
  : # already configured, just needs a fresh shell
elif [ -e "$rc" ] && [ ! -w "$rc" ]; then
  echo "$(tildify "$rc") is not writable; add $(tildify "$bin_dir") to your PATH manually:"
  refresh="$export_line"
else
  mkdir -p "$(dirname "$rc")"
  printf '\n# porffor\n%s\n' "$export_line" >> "$rc"
  echo "added $(tildify "$bin_dir") to PATH in $(tildify "$rc")"
fi

echo "to get started, run:"
echo "  ${bold}$refresh${reset}"
echo "  ${bold}porf --help${reset}"
