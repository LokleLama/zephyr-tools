# Zephyr Tools for VSCode

Circuit Dojo designed Zephyr Tools to make getting started with Zephyr a snap. More information and features coming.

## Features

- Multi-plaftorm support
- Setup Zephyr dependencies and ARM toolchain
- Initialize remote and local repositories
- Build and flash your code
- Bring your own Zephyr modules

## Requirements

### Mac

Requires `git` and `python3` to be installed. The easiest way to do that is with [Homebrew](https://brew.sh).

```
> brew install git python3
```

### Windows

Requires `git` and `python` to be installed.

- Download and install `git` from here: https://git-scm.com/download/win
- Download and install `python` from here: https://www.python.org/ftp/python/3.9.9/python-3.9.9-amd64.exe

### Linux

Requires `git` and `python` to be installed.

Use your distro's package manager of choice to install. 

For example on Ubuntu:

```
sudo apt install git python3 python3-pip
```

## TODO List

Here are some of the tasks needed to be completed for this project:

- [ ] Reinstall dependencies if manifest differs from what's installed
- [ ] Creating a new project from scratch/template
- [ ] CI/CD
- [ ] Init check for branchs and prompts which to download
- [ ] Using probe-rs for programming (cross platform)