#!/usr/bin/env bash

_out() {
	local BAR="==========="

	echo
	echo "-${BAR} ${1} ${BAR}-"
}

_smf() {
	git submodule foreach --recursive git ${*}
}

_out "Repo fetch"
git fetch --all --prune

_out "Repo pull"
git pull --prune

_out "Submodule fetch"
_smf fetch --all --prune

_out "Submodule checkout master"
_smf checkout master

_out "Submodule pull"
_smf pull

_out "Submodule status"
git submodule

_out "Repo status"
git status
