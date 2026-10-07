// Copyright 2022 DOIO
// Copyright 2022 HorrorTroll
// Copyright 2026 viaecho contributors
// SPDX-License-Identifier: GPL-2.0-or-later

#include QMK_KEYBOARD_H
#include "via.h"
#include "lib/layer_status/layer_status.h"

enum layer_names {
    _BASE,
    _FN,
    _FN1,
    _FN2,
};

// This keymap only supplies the defaults copied into VIA EEPROM on first boot.
// Export the current layout from VIA before flashing, then import it afterwards.
const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
    [_BASE] = LAYOUT(
        KC_1,     KC_2,    KC_3,    KC_4,     KC_MPLY,
        KC_5,     KC_6,    KC_7,    KC_8,     TO(_FN),
        KC_9,     KC_0,    KC_UP,   KC_ENT,   KC_MUTE,
        MO(_FN2), KC_LEFT, KC_DOWN, KC_RIGHT
    ),
    [_FN] = LAYOUT(
        _______, _______, _______, _______, _______,
        _______, _______, _______, _______, TO(_FN1),
        _______, _______, _______, _______, _______,
        _______, _______, _______, _______
    ),
    [_FN1] = LAYOUT(
        _______, _______, _______, _______, _______,
        _______, _______, _______, _______, TO(_FN2),
        _______, _______, _______, _______, _______,
        _______, _______, _______, _______
    ),
    [_FN2] = LAYOUT(
        RM_SPDU, RM_SPDD, _______, QK_BOOT, _______,
        RM_SATU, RM_SATD, _______, _______, TO(_BASE),
        RM_TOGG, RM_NEXT, RM_HUEU, _______, _______,
        _______, RM_VALU, RM_HUED, RM_VALD
    ),
};

#ifdef OLED_ENABLE
bool oled_task_user(void) {
    render_layer_status();
    return true;
}
#endif

#ifdef ENCODER_MAP_ENABLE
const uint16_t PROGMEM encoder_map[][NUM_ENCODERS][NUM_DIRECTIONS] = {
    [_BASE] = {
        ENCODER_CCW_CW(KC_MPRV, KC_MNXT),
        ENCODER_CCW_CW(KC_PGDN, KC_PGUP),
        ENCODER_CCW_CW(KC_VOLD, KC_VOLU),
    },
    [_FN] = {
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
    },
    [_FN1] = {
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
    },
    [_FN2] = {
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
        ENCODER_CCW_CW(KC_TRNS, KC_TRNS),
    },
};
#endif

#define VIA_ECHO_CHANNEL 0x00
#define VIA_ECHO_VALUE_ID 0x42
#define VIA_ECHO_PROTOCOL_VERSION 0x01

static uint8_t encoder_counters[NUM_ENCODERS] = {0};

bool process_record_user(uint16_t keycode, keyrecord_t *record) {
    (void)keycode;
    // ENCODER_MAP_ENABLE sends rotations through the normal keycode pipeline.
    // Count the synthetic press event here so VIA's configured action still runs.
    if (record->event.pressed && IS_ENCODEREVENT(record->event)) {
        uint8_t index = record->event.key.col;
        if (index < NUM_ENCODERS) {
            encoder_counters[index] += record->event.type == ENCODER_CW_EVENT ? 1 : -1;
        }
    }

    return true;
}

void via_custom_value_command_kb(uint8_t *data, uint8_t length) {
    if (length < 12 || data[1] != VIA_ECHO_CHANNEL || data[2] != VIA_ECHO_VALUE_ID) {
        data[0] = id_unhandled;
        return;
    }

    if (data[0] != id_custom_get_value) {
        data[0] = id_unhandled;
        return;
    }

    data[3] = VIA_ECHO_PROTOCOL_VERSION;
    data[4] = get_highest_layer(layer_state | default_layer_state);
    for (uint8_t row = 0; row < MATRIX_ROWS; ++row) {
        data[5 + row] = (uint8_t)matrix_get_row(row);
    }
    for (uint8_t index = 0; index < NUM_ENCODERS; ++index) {
        data[9 + index] = encoder_counters[index];
    }
}
