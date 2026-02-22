## Memory Alignment

SIMD operations perform best with aligned memory. Aligned loads and stores are faster than unaligned ones. Most SIMD instruction sets require 16-byte alignment for SSE and 32-byte alignment for AVX.