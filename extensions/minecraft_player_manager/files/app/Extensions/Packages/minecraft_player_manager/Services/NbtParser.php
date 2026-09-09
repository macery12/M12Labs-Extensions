<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Services;

/**
 * Lightweight NBT (Named Binary Tag) parser for Minecraft player data files.
 * Parses compressed .dat files and extracts inventory, location, and other data.
 *
 * A playerdata file is written by the game, but it lives on a filesystem the
 * server owner controls, so this treats it as untrusted input throughout. NBT
 * is a self-describing format in which the file states its own array lengths
 * and nesting, which means an unbounded reader can be told to allocate two
 * billion elements or recurse until the stack gives out — from four bytes of
 * input. Every limit below exists to make the cost of parsing a function of the
 * limits rather than of what the file claims.
 */
class NbtParser
{
    /**
     * Ceiling on the decompressed document.
     *
     * gzdecode() expands whatever it is given, so bounding the compressed file
     * alone bounds nothing: a few hundred kilobytes can expand to gigabytes.
     */
    private const MAX_UNCOMPRESSED_BYTES = 16_777_216;

    /** Nesting depth, which is what bounds recursion into the stack. */
    private const MAX_DEPTH = 64;

    /** Total tags in one document, which bounds total parser work. */
    private const MAX_TAGS = 500_000;

    /**
     * Elements in a single list or array.
     *
     * The length is read from the file as a signed 32-bit int, so without this
     * a crafted length is a loop counter the caller chose.
     */
    private const MAX_ELEMENTS = 1_048_576;

    private string $data;

    private int $offset = 0;

    private int $depth = 0;

    private int $tags = 0;

    // NBT Tag Types
    private const TAG_END = 0;
    private const TAG_BYTE = 1;
    private const TAG_SHORT = 2;
    private const TAG_INT = 3;
    private const TAG_LONG = 4;
    private const TAG_FLOAT = 5;
    private const TAG_DOUBLE = 6;
    private const TAG_BYTE_ARRAY = 7;
    private const TAG_STRING = 8;
    private const TAG_LIST = 9;
    private const TAG_COMPOUND = 10;
    private const TAG_INT_ARRAY = 11;
    private const TAG_LONG_ARRAY = 12;

    /**
     * Parse an NBT file (gzip compressed).
     */
    public function parseFile(string $filePath): array
    {
        if (!file_exists($filePath)) {
            throw new \Exception("NBT file not found: $filePath");
        }

        $contents = file_get_contents($filePath);

        if ($contents === false) {
            throw new \Exception('Failed to read NBT file');
        }

        return $this->parse($contents);
    }

    /**
     * Parse NBT data from raw bytes.
     */
    /**
     * Parse an NBT document from raw bytes, gzipped or not.
     *
     * Callers that already hold the bytes should use this rather than writing a
     * temporary file: there is no reason for a document that arrived over the
     * network to touch the filesystem on its way to the parser, and no
     * temporary file means no cleanup path to get wrong.
     */
    public function parse(string $data): array
    {
        $this->data = $this->decompress($data);

        return $this->reset()->readTag();
    }

    /**
     * Decompress if gzipped, bounded either way.
     *
     * @throws \Exception
     */
    private function decompress(string $data): string
    {
        // Check for gzip magic number
        if (substr($data, 0, 2) !== "\x1f\x8b") {
            if (strlen($data) > self::MAX_UNCOMPRESSED_BYTES) {
                throw new \Exception('NBT document is larger than this parser will read');
            }

            return $data;
        }

        // gzdecode() with a length argument stops at the ceiling instead of
        // expanding whatever the archive claims.
        $decoded = @gzdecode($data, self::MAX_UNCOMPRESSED_BYTES);

        if ($decoded === false) {
            throw new \Exception('Failed to decompress NBT document');
        }

        // gzdecode() truncates silently at the limit, so a document that
        // reached it is rejected rather than parsed as a partial file.
        if (strlen($decoded) >= self::MAX_UNCOMPRESSED_BYTES) {
            throw new \Exception('NBT document is larger than this parser will decompress');
        }

        return $decoded;
    }

    /** Clear per-document counters so one instance can parse more than once. */
    private function reset(): self
    {
        $this->offset = 0;
        $this->depth = 0;
        $this->tags = 0;

        return $this;
    }

    /**
     * Assert that $count bytes remain.
     *
     * Without this a truncated or crafted file walks the offset past the end of
     * the string, where PHP yields empty reads and warnings rather than an
     * error the caller can act on.
     */
    private function need(int $count): void
    {
        if ($count < 0 || $this->offset + $count > strlen($this->data)) {
            throw new \Exception('Malformed NBT: read past end of document');
        }
    }

    /** Count one tag against the document-wide ceiling. */
    private function countTag(): void
    {
        if (++$this->tags > self::MAX_TAGS) {
            throw new \Exception('Malformed NBT: document declares too many tags');
        }
    }

    /**
     * Validate a length read out of the document.
     *
     * A negative length is malformed; an enormous one is a loop counter the
     * file chose. Both are refused before any allocation happens.
     */
    private function boundedLength(int $length): int
    {
        if ($length < 0) {
            throw new \Exception('Malformed NBT: negative length');
        }

        if ($length > self::MAX_ELEMENTS) {
            throw new \Exception('Malformed NBT: declared length exceeds the parser limit');
        }

        return $length;
    }

    private function readTag(): array
    {
        $this->countTag();
        $type = $this->readByte();
        
        if ($type === self::TAG_END) {
            return ['type' => 'end'];
        }

        $name = $this->readString();
        $value = $this->readPayload($type);

        return [
            'name' => $name,
            'value' => $value,
        ];
    }

    private function readPayload(int $type): mixed
    {
        return match ($type) {
            self::TAG_END => null,
            self::TAG_BYTE => $this->readByte(),
            self::TAG_SHORT => $this->readShort(),
            self::TAG_INT => $this->readInt(),
            self::TAG_LONG => $this->readLong(),
            self::TAG_FLOAT => $this->readFloat(),
            self::TAG_DOUBLE => $this->readDouble(),
            self::TAG_BYTE_ARRAY => $this->readByteArray(),
            self::TAG_STRING => $this->readString(),
            self::TAG_LIST => $this->readList(),
            self::TAG_COMPOUND => $this->readCompound(),
            self::TAG_INT_ARRAY => $this->readIntArray(),
            self::TAG_LONG_ARRAY => $this->readLongArray(),
            default => throw new \Exception("Unknown NBT tag type: $type"),
        };
    }

    private function readByte(): int
    {
        $this->need(1);
        $value = ord($this->data[$this->offset]);
        $this->offset++;
        // Convert to signed byte
        return $value > 127 ? $value - 256 : $value;
    }

    private function readUnsignedByte(): int
    {
        $this->need(1);
        $value = ord($this->data[$this->offset]);
        $this->offset++;
        return $value;
    }

    private function readShort(): int
    {
        $this->need(2);
        $bytes = substr($this->data, $this->offset, 2);
        $this->offset += 2;
        $value = unpack('n', $bytes)[1];
        // Convert to signed short
        return $value > 32767 ? $value - 65536 : $value;
    }

    private function readInt(): int
    {
        $this->need(4);
        $bytes = substr($this->data, $this->offset, 4);
        $this->offset += 4;
        $value = unpack('N', $bytes)[1];
        // Convert to signed int (PHP handles this)
        if ($value > 2147483647) {
            $value -= 4294967296;
        }
        return $value;
    }

    private function readLong(): int|string
    {
        $this->need(8);
        $bytes = substr($this->data, $this->offset, 8);
        $this->offset += 8;
        $value = unpack('J', $bytes)[1];
        return $value;
    }

    private function readFloat(): float
    {
        $this->need(4);
        $bytes = substr($this->data, $this->offset, 4);
        $this->offset += 4;
        // Reverse bytes for big-endian
        $bytes = strrev($bytes);
        return unpack('f', $bytes)[1];
    }

    private function readDouble(): float
    {
        $this->need(8);
        $bytes = substr($this->data, $this->offset, 8);
        $this->offset += 8;
        // Reverse bytes for big-endian
        $bytes = strrev($bytes);
        return unpack('d', $bytes)[1];
    }

    private function readString(): string
    {
        // The wire format is an unsigned 16-bit length; readShort() reinterprets
        // the high half as negative, so read it unsigned here. The previous
        // code clamped that to 0 and silently produced an empty name.
        $this->need(2);
        $length = unpack('n', substr($this->data, $this->offset, 2))[1];
        $this->offset += 2;

        $this->need($length);
        $value = substr($this->data, $this->offset, $length);
        $this->offset += $length;
        return $value;
    }

    private function readByteArray(): array
    {
        $length = $this->boundedLength($this->readInt());
        $this->need($length);
        $values = [];
        for ($i = 0; $i < $length; $i++) {
            $values[] = $this->readByte();
        }
        return $values;
    }

    private function readIntArray(): array
    {
        $length = $this->boundedLength($this->readInt());
        $this->need($length * 4);
        $values = [];
        for ($i = 0; $i < $length; $i++) {
            $values[] = $this->readInt();
        }
        return $values;
    }

    private function readLongArray(): array
    {
        $length = $this->boundedLength($this->readInt());
        $this->need($length * 8);
        $values = [];
        for ($i = 0; $i < $length; $i++) {
            $values[] = $this->readLong();
        }
        return $values;
    }

    private function readList(): array
    {
        $itemType = $this->readUnsignedByte();
        $length = $this->boundedLength($this->readInt());

        $values = [];
        for ($i = 0; $i < $length; $i++) {
            $this->countTag();
            $values[] = $this->readPayload($itemType);
        }

        return $values;
    }

    private function readCompound(): array
    {
        // Depth is tracked here because compounds and lists are the only tags
        // that recurse; without it a file of nothing but open compounds
        // exhausts the stack, which PHP cannot catch.
        if (++$this->depth > self::MAX_DEPTH) {
            throw new \Exception('Malformed NBT: nesting exceeds the parser limit');
        }

        $values = [];

        try {
            while (true) {
                // need(1) inside readUnsignedByte() ends an unterminated
                // compound with a clear error rather than an infinite loop.
                $type = $this->readUnsignedByte();

                if ($type === self::TAG_END) {
                    break;
                }

                $this->countTag();
                $name = $this->readString();
                $values[$name] = $this->readPayload($type);
            }
        } finally {
            $this->depth--;
        }

        return $values;
    }

    /**
     * Extract player inventory from parsed NBT data.
     */
    public static function extractInventory(array $nbt): array
    {
        $data = $nbt['value'] ?? $nbt;
        $inventory = [];
        
        // Main inventory (slots 0-35)
        if (isset($data['Inventory']) && is_array($data['Inventory'])) {
            foreach ($data['Inventory'] as $item) {
                $inventory[] = self::parseItem($item);
            }
        }

        return $inventory;
    }

    /**
     * Extract armor from parsed NBT data.
     */
    public static function extractArmor(array $nbt): array
    {
        $data = $nbt['value'] ?? $nbt;
        $armor = [
            'helmet' => null,
            'chestplate' => null,
            'leggings' => null,
            'boots' => null,
        ];

        // Method 1: Check equipment field (Minecraft 1.20.5+)
        // Equipment format: {head: {}, chest: {}, legs: {}, feet: {}, mainhand: {}, offhand: {}}
        // Or as a list: [{slot: "head", item: {}}, ...]
        if (isset($data['equipment']) && is_array($data['equipment'])) {
            $equipment = $data['equipment'];
            
            // Check for named keys format (1.21+)
            if (isset($equipment['head']) && is_array($equipment['head']) && !empty($equipment['head'])) {
                $armor['helmet'] = self::parseItem($equipment['head']);
            }
            if (isset($equipment['chest']) && is_array($equipment['chest']) && !empty($equipment['chest'])) {
                $armor['chestplate'] = self::parseItem($equipment['chest']);
            }
            if (isset($equipment['legs']) && is_array($equipment['legs']) && !empty($equipment['legs'])) {
                $armor['leggings'] = self::parseItem($equipment['legs']);
            }
            if (isset($equipment['feet']) && is_array($equipment['feet']) && !empty($equipment['feet'])) {
                $armor['boots'] = self::parseItem($equipment['feet']);
            }
            
            // Check for list format with slot names
            if (isset($equipment[0])) {
                foreach ($equipment as $slot) {
                    if (!is_array($slot)) continue;
                    $slotName = $slot['slot'] ?? '';
                    $item = $slot['item'] ?? $slot;
                    
                    if (empty($item) || !isset($item['id'])) continue;
                    
                    switch ($slotName) {
                        case 'head':
                        case 'minecraft:head':
                            $armor['helmet'] = self::parseItem($item);
                            break;
                        case 'chest':
                        case 'minecraft:chest':
                            $armor['chestplate'] = self::parseItem($item);
                            break;
                        case 'legs':
                        case 'minecraft:legs':
                            $armor['leggings'] = self::parseItem($item);
                            break;
                        case 'feet':
                        case 'minecraft:feet':
                            $armor['boots'] = self::parseItem($item);
                            break;
                    }
                }
            }
        }

        // Method 2: Fallback to Inventory slots 100-103 (pre-1.20.5)
        if (isset($data['Inventory']) && is_array($data['Inventory'])) {
            foreach ($data['Inventory'] as $item) {
                $slot = $item['Slot'] ?? -1;
                
                // Handle if slot is wrapped in an array or value key
                if (is_array($slot)) {
                    $slot = $slot['value'] ?? $slot[0] ?? -1;
                }
                
                // Convert to int
                $slot = (int) $slot;
                
                // Handle negative values (signed byte interpretation)
                if ($slot < 0) {
                    $slot = $slot + 256;
                }
                
                switch ($slot) {
                    case 100:
                        if ($armor['boots'] === null) {
                            $armor['boots'] = self::parseItem($item);
                        }
                        break;
                    case 101:
                        if ($armor['leggings'] === null) {
                            $armor['leggings'] = self::parseItem($item);
                        }
                        break;
                    case 102:
                        if ($armor['chestplate'] === null) {
                            $armor['chestplate'] = self::parseItem($item);
                        }
                        break;
                    case 103:
                        if ($armor['helmet'] === null) {
                            $armor['helmet'] = self::parseItem($item);
                        }
                        break;
                }
            }
        }

        return $armor;
    }

    /**
     * Extract ender chest contents from parsed NBT data.
     */
    public static function extractEnderChest(array $nbt): array
    {
        $data = $nbt['value'] ?? $nbt;
        $enderChest = [];

        if (isset($data['EnderItems']) && is_array($data['EnderItems'])) {
            foreach ($data['EnderItems'] as $item) {
                $enderChest[] = self::parseItem($item);
            }
        }

        return $enderChest;
    }

    /**
     * Extract player location from parsed NBT data.
     */
    public static function extractLocation(array $nbt): array
    {
        $data = $nbt['value'] ?? $nbt;
        
        $pos = $data['Pos'] ?? [0, 0, 0];
        $rotation = $data['Rotation'] ?? [0, 0];
        $dimension = $data['Dimension'] ?? 'minecraft:overworld';

        // Handle old-style dimension IDs
        if (is_int($dimension)) {
            $dimension = match ($dimension) {
                -1 => 'minecraft:the_nether',
                0 => 'minecraft:overworld',
                1 => 'minecraft:the_end',
                default => 'minecraft:overworld',
            };
        }

        return [
            'x' => round($pos[0] ?? 0, 2),
            'y' => round($pos[1] ?? 0, 2),
            'z' => round($pos[2] ?? 0, 2),
            'yaw' => round($rotation[0] ?? 0, 2),
            'pitch' => round($rotation[1] ?? 0, 2),
            'dimension' => $dimension,
            'world' => self::getDimensionName($dimension),
        ];
    }

    /**
     * Extract player health and food data.
     */
    public static function extractStats(array $nbt): array
    {
        $data = $nbt['value'] ?? $nbt;

        return [
            'health' => $data['Health'] ?? 20,
            'maxHealth' => 20, // Default, can be modified by attributes
            'food' => $data['foodLevel'] ?? 20,
            'saturation' => round($data['foodSaturationLevel'] ?? 5, 2),
            'xpLevel' => $data['XpLevel'] ?? 0,
            'xpTotal' => $data['XpTotal'] ?? 0,
            'xpProgress' => round(($data['XpP'] ?? 0) * 100, 1),
            'gamemode' => self::getGamemodeName($data['playerGameType'] ?? 0),
            'score' => $data['Score'] ?? 0,
        ];
    }

    /**
     * Parse a single item from NBT (public wrapper).
     */
    public static function parseItemPublic(array $item): array
    {
        return self::parseItem($item);
    }

    /**
     * Parse a single item from NBT.
     */
    private static function parseItem(array $item): array
    {
        $id = $item['id'] ?? $item['Id'] ?? 'minecraft:air';
        
        // Handle numeric IDs (legacy)
        if (is_int($id)) {
            $id = "minecraft:legacy_$id";
        }

        // Remove minecraft: prefix for display
        $displayId = str_replace('minecraft:', '', $id);

        $parsed = [
            'id' => $id,
            'displayId' => $displayId,
            'name' => self::getItemName($displayId),
            'slot' => $item['Slot'] ?? 0,
            'count' => $item['Count'] ?? $item['count'] ?? 1,
            'damage' => $item['Damage'] ?? 0,
            'enchantments' => [],
            'storedEnchantments' => [],
            'customName' => null,
            'lore' => [],
            'durability' => null,
            'contents' => [],
        ];

        // Parse tag data (contains enchantments, custom name, etc.)
        $tag = $item['tag'] ?? $item['components'] ?? [];
        
        if (!empty($tag)) {
            // Custom name
            if (isset($tag['display']['Name'])) {
                $name = $tag['display']['Name'];
                // Try to parse JSON text component
                if (str_starts_with($name, '{') || str_starts_with($name, '"')) {
                    $decoded = json_decode($name, true);
                    $parsed['customName'] = $decoded['text'] ?? $name;
                } else {
                    $parsed['customName'] = $name;
                }
            }

            // Custom name (1.20.5+ format)
            if (isset($tag['minecraft:custom_name'])) {
                $name = $tag['minecraft:custom_name'];
                if (is_string($name)) {
                    $decoded = json_decode($name, true);
                    $parsed['customName'] = $decoded['text'] ?? $name;
                }
            }

            // Lore
            if (isset($tag['display']['Lore']) && is_array($tag['display']['Lore'])) {
                foreach ($tag['display']['Lore'] as $line) {
                    if (str_starts_with($line, '{') || str_starts_with($line, '"')) {
                        $decoded = json_decode($line, true);
                        $parsed['lore'][] = $decoded['text'] ?? $line;
                    } else {
                        $parsed['lore'][] = $line;
                    }
                }
            }

            // Enchantments (multiple formats for different versions)
            // Pre-1.20.5: tag.Enchantments or tag.ench (array of {id, lvl})
            // 1.20.5+: tag.minecraft:enchantments (object {minecraft:enchant_id: level})
            $enchants = $tag['Enchantments'] ?? $tag['ench'] ?? [];
            
            // Handle 1.20.5+ format: minecraft:enchantments is an object directly
            if (empty($enchants) && isset($tag['minecraft:enchantments'])) {
                $enchantsData = $tag['minecraft:enchantments'];
                // It could be {levels: {...}} or directly {...}
                if (isset($enchantsData['levels']) && is_array($enchantsData['levels'])) {
                    $enchants = $enchantsData['levels'];
                } elseif (is_array($enchantsData)) {
                    $enchants = $enchantsData;
                }
            }
            
            if (is_array($enchants)) {
                foreach ($enchants as $key => $enchant) {
                    if (is_array($enchant)) {
                        // Old format: {id: "minecraft:mending", lvl: 1}
                        $enchId = $enchant['id'] ?? '';
                        $level = $enchant['lvl'] ?? 1;
                    } else {
                        // 1.20.5+ format: key is enchant id, value is level
                        $enchId = $key;
                        $level = (int) $enchant;
                    }
                    
                    // Remove minecraft: prefix
                    $enchId = str_replace('minecraft:', '', $enchId);
                    
                    if (!empty($enchId)) {
                        $parsed['enchantments'][] = [
                            'id' => $enchId,
                            'name' => self::getEnchantmentName($enchId),
                            'level' => $level,
                            'levelRoman' => self::toRoman($level),
                        ];
                    }
                }
            }

            // Stored Enchantments (for enchanted books)
            // Pre-1.20.5: tag.StoredEnchantments (array of {id, lvl})
            // 1.20.5+: tag.minecraft:stored_enchantments (object {minecraft:enchant_id: level})
            $storedEnchants = $tag['StoredEnchantments'] ?? [];
            
            // Handle 1.20.5+ format
            if (empty($storedEnchants) && isset($tag['minecraft:stored_enchantments'])) {
                $storedData = $tag['minecraft:stored_enchantments'];
                if (isset($storedData['levels']) && is_array($storedData['levels'])) {
                    $storedEnchants = $storedData['levels'];
                } elseif (is_array($storedData)) {
                    $storedEnchants = $storedData;
                }
            }
            
            if (is_array($storedEnchants)) {
                foreach ($storedEnchants as $key => $enchant) {
                    if (is_array($enchant)) {
                        $enchId = $enchant['id'] ?? '';
                        $level = $enchant['lvl'] ?? 1;
                    } else {
                        // 1.20.5+ format
                        $enchId = $key;
                        $level = (int) $enchant;
                    }
                    
                    $enchId = str_replace('minecraft:', '', $enchId);
                    
                    if (!empty($enchId)) {
                        $parsed['storedEnchantments'][] = [
                            'id' => $enchId,
                            'name' => self::getEnchantmentName($enchId),
                            'level' => $level,
                            'levelRoman' => self::toRoman($level),
                        ];
                    }
                }
            }

            // Bundle contents (1.17+)
            $bundleContents = $tag['Items'] ?? $tag['minecraft:bundle_contents'] ?? [];
            if (is_array($bundleContents) && !empty($bundleContents)) {
                foreach ($bundleContents as $contentItem) {
                    // 1.20.5+ format: each item might have 'item' wrapper
                    if (isset($contentItem['item'])) {
                        $parsed['contents'][] = self::parseItem($contentItem['item']);
                    } else {
                        $parsed['contents'][] = self::parseItem($contentItem);
                    }
                }
            }

            // Shulker box / Block entity contents
            // Pre-1.20.5: tag.BlockEntityTag.Items
            // 1.20.5+: components.minecraft:container (array of {slot, item})
            $blockEntityTag = $tag['BlockEntityTag'] ?? null;
            $containerComponent = $tag['minecraft:container'] ?? null;
            
            // Handle pre-1.20.5 format (BlockEntityTag.Items)
            if ($blockEntityTag !== null && is_array($blockEntityTag)) {
                $containerItems = $blockEntityTag['Items'] ?? [];
                if (is_array($containerItems) && !empty($containerItems)) {
                    foreach ($containerItems as $contentItem) {
                        if (isset($contentItem['id'])) {
                            $parsed['contents'][] = self::parseItem($contentItem);
                        }
                    }
                }
            }
            
            // Handle 1.20.5+ format (minecraft:container array of {slot, item})
            if ($containerComponent !== null && is_array($containerComponent)) {
                foreach ($containerComponent as $slotData) {
                    // Format: [{slot: 0, item: {id: "minecraft:...", ...}}, ...]
                    if (isset($slotData['item'])) {
                        $parsed['contents'][] = self::parseItem($slotData['item']);
                    } elseif (isset($slotData['id'])) {
                        // Direct item format
                        $parsed['contents'][] = self::parseItem($slotData);
                    }
                }
            }

            // Durability
            if (isset($tag['Damage'])) {
                $parsed['damage'] = $tag['Damage'];
            }
            if (isset($tag['minecraft:damage'])) {
                $parsed['damage'] = $tag['minecraft:damage'];
            }

            // Max durability
            $maxDurability = self::getMaxDurability($displayId);
            if ($maxDurability > 0) {
                $parsed['durability'] = [
                    'current' => $maxDurability - ($parsed['damage'] ?? 0),
                    'max' => $maxDurability,
                    'percentage' => round((($maxDurability - ($parsed['damage'] ?? 0)) / $maxDurability) * 100, 1),
                ];
            }
        }

        return $parsed;
    }

    /**
     * Get human-readable dimension name.
     */
    private static function getDimensionName(string $dimension): string
    {
        return match ($dimension) {
            'minecraft:overworld' => 'Overworld',
            'minecraft:the_nether' => 'The Nether',
            'minecraft:the_end' => 'The End',
            default => ucwords(str_replace(['minecraft:', '_'], ['', ' '], $dimension)),
        };
    }

    /**
     * Get human-readable gamemode name.
     */
    private static function getGamemodeName(int $mode): string
    {
        return match ($mode) {
            0 => 'Survival',
            1 => 'Creative',
            2 => 'Adventure',
            3 => 'Spectator',
            default => 'Unknown',
        };
    }

    /**
     * Convert item ID to readable name.
     */
    private static function getItemName(string $id): string
    {
        // Convert snake_case to Title Case
        $name = str_replace('_', ' ', $id);
        return ucwords($name);
    }

    /**
     * Convert enchantment ID to readable name.
     */
    private static function getEnchantmentName(string $id): string
    {
        $names = [
            'protection' => 'Protection',
            'fire_protection' => 'Fire Protection',
            'feather_falling' => 'Feather Falling',
            'blast_protection' => 'Blast Protection',
            'projectile_protection' => 'Projectile Protection',
            'respiration' => 'Respiration',
            'aqua_affinity' => 'Aqua Affinity',
            'thorns' => 'Thorns',
            'depth_strider' => 'Depth Strider',
            'frost_walker' => 'Frost Walker',
            'binding_curse' => 'Curse of Binding',
            'soul_speed' => 'Soul Speed',
            'swift_sneak' => 'Swift Sneak',
            'sharpness' => 'Sharpness',
            'smite' => 'Smite',
            'bane_of_arthropods' => 'Bane of Arthropods',
            'knockback' => 'Knockback',
            'fire_aspect' => 'Fire Aspect',
            'looting' => 'Looting',
            'sweeping' => 'Sweeping Edge',
            'sweeping_edge' => 'Sweeping Edge',
            'efficiency' => 'Efficiency',
            'silk_touch' => 'Silk Touch',
            'unbreaking' => 'Unbreaking',
            'fortune' => 'Fortune',
            'power' => 'Power',
            'punch' => 'Punch',
            'flame' => 'Flame',
            'infinity' => 'Infinity',
            'luck_of_the_sea' => 'Luck of the Sea',
            'lure' => 'Lure',
            'loyalty' => 'Loyalty',
            'impaling' => 'Impaling',
            'riptide' => 'Riptide',
            'channeling' => 'Channeling',
            'multishot' => 'Multishot',
            'quick_charge' => 'Quick Charge',
            'piercing' => 'Piercing',
            'mending' => 'Mending',
            'vanishing_curse' => 'Curse of Vanishing',
            'density' => 'Density',
            'breach' => 'Breach',
            'wind_burst' => 'Wind Burst',
        ];

        return $names[$id] ?? ucwords(str_replace('_', ' ', $id));
    }

    /**
     * Get max durability for an item.
     */
    private static function getMaxDurability(string $id): int
    {
        $durabilities = [
            // Tools - Wood
            'wooden_sword' => 59, 'wooden_pickaxe' => 59, 'wooden_axe' => 59, 
            'wooden_shovel' => 59, 'wooden_hoe' => 59,
            // Tools - Stone
            'stone_sword' => 131, 'stone_pickaxe' => 131, 'stone_axe' => 131,
            'stone_shovel' => 131, 'stone_hoe' => 131,
            // Tools - Iron
            'iron_sword' => 250, 'iron_pickaxe' => 250, 'iron_axe' => 250,
            'iron_shovel' => 250, 'iron_hoe' => 250,
            // Tools - Gold
            'golden_sword' => 32, 'golden_pickaxe' => 32, 'golden_axe' => 32,
            'golden_shovel' => 32, 'golden_hoe' => 32,
            // Tools - Diamond
            'diamond_sword' => 1561, 'diamond_pickaxe' => 1561, 'diamond_axe' => 1561,
            'diamond_shovel' => 1561, 'diamond_hoe' => 1561,
            // Tools - Netherite
            'netherite_sword' => 2031, 'netherite_pickaxe' => 2031, 'netherite_axe' => 2031,
            'netherite_shovel' => 2031, 'netherite_hoe' => 2031,
            // Armor - Leather
            'leather_helmet' => 55, 'leather_chestplate' => 80,
            'leather_leggings' => 75, 'leather_boots' => 65,
            // Armor - Chain
            'chainmail_helmet' => 165, 'chainmail_chestplate' => 240,
            'chainmail_leggings' => 225, 'chainmail_boots' => 195,
            // Armor - Iron
            'iron_helmet' => 165, 'iron_chestplate' => 240,
            'iron_leggings' => 225, 'iron_boots' => 195,
            // Armor - Gold
            'golden_helmet' => 77, 'golden_chestplate' => 112,
            'golden_leggings' => 105, 'golden_boots' => 91,
            // Armor - Diamond
            'diamond_helmet' => 363, 'diamond_chestplate' => 528,
            'diamond_leggings' => 495, 'diamond_boots' => 429,
            // Armor - Netherite
            'netherite_helmet' => 407, 'netherite_chestplate' => 592,
            'netherite_leggings' => 555, 'netherite_boots' => 481,
            // Other
            'bow' => 384, 'crossbow' => 465, 'trident' => 250,
            'shield' => 336, 'elytra' => 432,
            'fishing_rod' => 64, 'shears' => 238, 'flint_and_steel' => 64,
            'carrot_on_a_stick' => 25, 'warped_fungus_on_a_stick' => 100,
            'brush' => 64, 'mace' => 500,
        ];

        return $durabilities[$id] ?? 0;
    }

    /**
     * Convert number to Roman numeral.
     */
    private static function toRoman(int $num): string
    {
        if ($num <= 0 || $num > 255) {
            return (string) $num;
        }

        $map = [
            100 => 'C', 90 => 'XC', 50 => 'L', 40 => 'XL',
            10 => 'X', 9 => 'IX', 5 => 'V', 4 => 'IV', 1 => 'I',
        ];

        $result = '';
        foreach ($map as $value => $roman) {
            while ($num >= $value) {
                $result .= $roman;
                $num -= $value;
            }
        }
        return $result;
    }
}
