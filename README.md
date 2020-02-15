# Resource Loader PWA Library

**Depends on [js-color](https://github.com/SergioRando/js-color) Library**
**Depends on [js-mixer](https://github.com/SergioRando/js-mixer) Library**
**Depends on [js-gallery](https://github.com/SergioRando/js-gallery) Library**
**Depends on [js-message](https://github.com/SergioRando/js-message) Library**

This is library for a fork project of [PWA](https://github.com/SergioRando/PWA)

Helper for preloading resources

# Install
Read full installation process before executing any command

Install only if u need to test this template before tamplating yours own project

## 1. GitHub account
Register one GitHub account, if u dont have it already

## 2. Visual Studio Code
Download and install **Visual Studio Code** from official link https://code.visualstudio.com/

## 3. Install Command Line Tools
Super user password required
```
sudo apt-get install git make minify default-jre nodejs
```
* Git - required to execute git commands
* Make - required to execute Makefiles
* Minify - required for HTML/CSS minification
* Java Runtime Environment (JRE) - required to launch Google Closure Compiler
* NodeJS - required for testing libraries

## 4. PWA Project
- Create new [PWA project](https://github.com/SergioRando/PWA)
- Or open existing project (project must be a fork from [PWA template](https://github.com/SergioRando/PWA)

## 5. Submodule
String Replacements
* _{Project Path}_ - path to drive with symlinks support (**NOT FAT32/NTFS/exFAT**)

```
cd {Project Path}/src/lib
git submodule add https://github.com/SergioRando/js-lite.git
```
_Note: don't forget to add notice about library license to yours project_

# Uninstall
String Replacements
* _{Project Path}_ - path to drive with symlinks support (**NOT FAT32/NTFS/exFAT**)
```
cd {Project Path}/src/lib
git submodule deinit js-lite
git rm js-lite
git commit -m "Removed submodule js-lite"
cd {Project Path}
rm -rf ./git/modules/src/lib/js-lite
```
_Note: be careful executing **rm** commands! It delete files permanenlty!_
