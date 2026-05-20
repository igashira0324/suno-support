# ace-step-music Harness Makefile
# Standardized interface for DGX SPARK environment

.PHONY: help start stop restart status setup logs clean

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  start     Start the entire music stack (Frontend, Backend, ACE-Step)"
	@echo "  stop      Stop all services"
	@echo "  restart   Stop and start"
	@echo "  status    Check service health and VRAM status"
	@echo "  setup     Install all dependencies (npm, venv, uv)"
	@echo "  logs      Stream all service logs"
	@echo "  clean     Remove logs and temporary files"

start:
	@./run_local.sh

stop:
	@./stop_local.sh

restart: stop start

status:
	@echo "--- Service Status ---"
	@printf "Frontend (3300):  "
	@ss -ltn | grep -q :3300 && echo "\033[0;32m[OK]\033[0m" || echo "\033[0;31m[DOWN]\033[0m"
	@printf "Backend (8100):   "
	@ss -ltn | grep -q :8100 && echo "\033[0;32m[OK]\033[0m" || echo "\033[0;31m[DOWN]\033[0m"
	@printf "ACE-Step (8101):  "
	@ss -ltn | grep -q :8101 && echo "\033[0;32m[OK]\033[0m" || echo "\033[0;31m[DOWN]\033[0m"
	@printf "FireCrawl (3002): "
	@ss -ltn | grep -q :3002 && echo "\033[0;32m[OK]\033[0m" || echo "\033[0;31m[DOWN]\033[0m"
	@echo ""
	@echo "--- VRAM Status ---"
	@python3 server/core/vram_utils.py

check-assets:
	@echo "Checking ACE-Step checkpoints..."
	@ls -d ace-step/checkpoints/acestep-v15-xl-sft > /dev/null 2>&1 && echo "  [OK] XL SFT found" || echo "  [MISSING] XL SFT"
	@ls -d ace-step/checkpoints/acestep-5Hz-lm-4B > /dev/null 2>&1 && echo "  [OK] LM 4B found" || echo "  [MISSING] LM 4B"

proxy-corp:
	./switch_proxy_mode.sh corporate

proxy-wifi:
	./switch_proxy_mode.sh wifi

setup:
	@echo "Installing Frontend dependencies..."
	@npm install
	@echo "Setting up Backend venv..."
	@cd server && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
	@echo "Setting up ACE-Step with uv..."
	@cd ace-step && uv sync

logs:
	@tail -f .logs/local/*.log

clean:
	rm -rf .logs/local/*
	rm -rf .run/*
