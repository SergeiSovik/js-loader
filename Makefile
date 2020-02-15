#
# Copyright 2020 Sergio Rando <segio.rando@yahoo.com>
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#		http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

ifndef PROJECT_DIR
$(error Use make only inside Project dir, submake requires variable imports)
endif

# List of Libraries to include
LIB_LIST=js-color js-gallery js-mixer js-message js-animation js-display

# Main entry point
# This file executed after all modules
MAIN=test.js

# List of global modules, executed before main module
GLOBALS=$(patsubst ./%,%,$(shell find ./globals/ -type f -name "*.js"))

# List of dependency modules, executed only if included in main or global modules
MODULES=$(patsubst ./%,%,$(shell find ./modules/ -type f -name "*.js"))

# List of external modules, executed only if included in main or global modules
define EXTERNAL
	src/include/time.js
	src/include/event.js
	src/include/uri.js
	src/include/texture.js
	src/include/sound.js
endef

# List of excluded modules
define EXCLUDES
endef

# Detect Current Dir Name (js-example)
DIR_NAME=$(shell basename "$(CURDIR)")
# Detect Source Dir Relative to Project (src/lib/js-example)
ABS_SRC=$(patsubst $(PROJECT_DIR)/%,%,$(CURDIR))
# Detect Binary Dir Relative to Project (tmp/lib/js-example)
ABS_BIN=$(patsubst src/%,tmp/%,$(ABS_SRC))
# Detect Project Dir Relative to Current Source Dir (../../..)
REL_ROOT=$(shell echo "$(ABS_SRC)" | sed -e 's/[^\/]\+/../g')
# Detect Binary Dir Relative to Current Dir (../../../tmp/lib/js-example)
REL_BIN ?= $(REL_ROOT)/$(ABS_BIN)

## Libraries
# Relative List of global modules of included libraries
REL_LIBS_GLOBALS=$(wildcard $(patsubst %,$(REL_ROOT)/src/lib/%/globals/*.js,$(LIB_LIST)))
# Relative List of dependency modules of included libraries
REL_LIBS_MODULES=$(wildcard $(patsubst %,$(REL_ROOT)/src/lib/%/modules/*.js,$(LIB_LIST)))
# Absolute List of global modules of included libraries
ABS_LIBS_GLOBALS=$(patsubst $(REL_ROOT)/%,%,$(REL_LIBS_GLOBALS))
# Absolute List of dependency modules of included libraries
ABS_LIBS_MODULES=$(patsubst $(REL_ROOT)/%,%,$(REL_LIBS_MODULES))
# GCC Libs Globals (src/pwa/globals/global.js src/pwa/main.js) 
GCC_LIBS_GLOBALS=$(patsubst %,--js %,$(ABS_LIBS_GLOBALS)) $(patsubst %,--entry_point %,$(ABS_LIBS_GLOBALS))
# GCC Libs Globals (src/pwa/globals/global.js src/pwa/main.js) 
GCC_LIBS_MODULES=$(patsubst %,--js %,$(ABS_LIBS_MODULES)) $(patsubst %,--entry_point %,$(ABS_LIBS_MODULES))
# Refs
REL_LIBS=$(REL_LIBS_GLOBALS) $(REL_LIBS_MODULES)
GCC_LIBS=$(GCC_LIBS_GLOBALS) $(GCC_LIBS_MODULES)

## Excludes
REL_EXCLUDES=$(strip $(EXCLUDES))

## Globals
# Main Binary Relative to Current Dir (../../../tmp/lib/js-example/test.js)
BIN_MAIN=$(patsubst %, $(REL_BIN)/%,$(MAIN))
# Relative Globals (globals/global.js test.js)
REL_GLOBALS=$(sort $(filter-out $(REL_EXCLUDES), $(strip $(GLOBALS)))) $(MAIN)
# GCC Globals (src/lib/js-example/globals/global.js src/lib/js-example/test.js) 
GCC_GLOBALS=$(patsubst %,--js $(ABS_SRC)/%,$(REL_GLOBALS)) $(patsubst %,--entry_point $(ABS_SRC)/%,$(REL_GLOBALS))

## Modules
# Relative Modules (modules/module.js)
REL_MODULES=$(sort $(filter-out $(REL_EXCLUDES), $(strip $(MODULES))))
# GCC Modules (src/lib/js-example/modules/module.js)
GCC_MODULES=$(patsubst %,--js $(ABS_SRC)/%,$(REL_MODULES))

## External
# Absolute External (src/includes/example.js)
SRC_EXTERNAL=$(strip $(EXTERNAL))
# Relative External (../../../src/includes/example.js)
REL_EXTERNAL=$(patsubst %,$(REL_ROOT)/%,$(SRC_EXTERNAL))
# GCC External (src/lib/js-example/includes/example.js)
GCC_EXTERNAL=$(patsubst %,--js %,$(SRC_EXTERNAL))

## Global External
REL_PLATFORM=$(patsubst %,$(REL_ROOT)/%,$(INC_PLATFORM))
GCC_ECMASCRIPT2017=$(GCC_OUT_ECMASCRIPT2017) $(patsubst %,--js %,$(INC_ECMASCRIPT2017)) $(patsubst %,--entry_point %,$(INC_ECMASCRIPT2017))
GCC_PLATFORM=$(patsubst %,--js %,$(INC_PLATFORM))

all: build-release

test: clean build-release

build-release: $(BIN_MAIN)

$(BIN_MAIN): $(REL_PLATFORM) $(REL_GLOBALS) $(REL_MODULES) $(REL_EXTERNAL) $(REL_LIBS) Makefile
	@echo "Building $(patsubst $(REL_ROOT)/%,%,$@)"
	@( cd $(REL_ROOT); $(strip $(GCC)) $(GCC_ECMASCRIPT2017) $(GCC_PLATFORM) $(GCC_EXTERNAL) $(GCC_LIBS) $(GCC_MODULES) $(GCC_GLOBALS) --create_source_map "$(patsubst $(REL_ROOT)/%,%,$@).map" --js_output_file "$(patsubst $(REL_ROOT)/%,%,$@)" 2>&1 | ./compiler/errors.sh )
	@echo "//# sourceMappingURL=$(patsubst $(REL_BIN)/%,%,$@).map" >> $@
	@sed -i 's:\"src/:\"$(REL_ROOT)/src/:g' $@.map
	@rm -r -f $@.html
	@echo "<script async=\"async\" src=\"$(MAIN)\"></script>" >> $@.html
	@echo "Running $(patsubst $(REL_ROOT)/%,%,$@)\n"
	@node $@
	@echo "\nExit $(patsubst $(REL_ROOT)/%,%,$@)\n"

clean:
	@echo "Cleaning $(ABS_BIN)"
	@rm -r -f $(REL_BIN)

merge:
	@$(PROJECT_DIR)/compiler/merge.sh
