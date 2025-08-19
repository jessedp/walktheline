.PHONY: package clean

package:
	@echo "Packaging extension..."
	cd src && zip -r -FS ../build/walktheline.zip . -x "*.git*" -x "Makefile" -x ".gitignore" -x "build/*" -x "GEMINI.md"
	@echo "Extension packaged to build/walktheline.zip"

clean:
	@echo "Cleaning build directory..."
	rm -rf build/*
	@echo "Build directory cleaned."