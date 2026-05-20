import subprocess
import os

def get_system_memory():
    """Get system memory info from /proc/meminfo or free command."""
    try:
        with open('/proc/meminfo', 'r') as f:
            lines = f.readlines()
        mem_info = {}
        for line in lines:
            parts = line.split(':')
            if len(parts) == 2:
                name = parts[0].strip()
                value = int(parts[1].split()[0]) // 1024 # Convert to MB
                mem_info[name] = value
        return mem_info
    except Exception:
        return {}

def get_vram_info():
    """
    Get VRAM information. For Blackwell/Unified memory, we fallback to system memory.
    """
    gpus = []
    try:
        cmd = [
            'nvidia-smi',
            '--query-gpu=index,name,memory.total,memory.used,memory.free',
            '--format=csv,nounits,noheader'
        ]
        output = subprocess.check_output(cmd).decode('utf-8').strip()
        for line in output.split('\n'):
            parts = [p.strip() for p in line.split(',')]
            if len(parts) == 5:
                idx, name, total, used, free = parts
                # Handle [N/A]
                if total == '[N/A]' or free == '[N/A]':
                    # Fallback to system memory
                    sys_mem = get_system_memory()
                    total_val = sys_mem.get('MemTotal', 124000)
                    available_val = sys_mem.get('MemAvailable', 0)
                    used_val = total_val - available_val
                    gpus.append({
                        'index': int(idx),
                        'name': f"{name} (Unified)",
                        'total': total_val,
                        'used': used_val,
                        'free': available_val
                    })
                else:
                    gpus.append({
                        'index': int(idx),
                        'name': name,
                        'total': int(total),
                        'used': int(used),
                        'free': int(free)
                    })
    except Exception:
        # Final fallback
        sys_mem = get_system_memory()
        if sys_mem:
            gpus.append({
                'index': 0,
                'name': "System Unified Memory",
                'total': sys_mem.get('MemTotal', 0),
                'used': sys_mem.get('MemTotal', 0) - sys_mem.get('MemAvailable', 0),
                'free': sys_mem.get('MemAvailable', 0)
            })
            
    return gpus

def check_vram_requirement(min_free_mb=40000):
    gpus = get_vram_info()
    if not gpus:
        return False, "Could not detect memory status."
    
    max_free = max(gpu['free'] for gpu in gpus)
    if max_free >= min_free_mb:
        return True, f"Success: {max_free}MB free (Required: {min_free_mb}MB)"
    else:
        return False, f"Low Memory: Only {max_free}MB free (Required: {min_free_mb}MB). Please stop other processes (e.g., ComfyUI, Ollama)."

if __name__ == "__main__":
    import sys
    req = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
    ok, msg = check_vram_requirement(req)
    print(msg)
    sys.exit(0 if ok else 1)
