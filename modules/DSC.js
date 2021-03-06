/* eslint no-unused-vars : 0 */

const convert = require('node-unit-conversion');


// Process to N decimal places
function ceil2(value, places = 2) {
	let multiplier = Number((1).toString().padEnd((places + 1), 0));
	return Math.ceil(value * multiplier + Number.EPSILON) / multiplier;
}

function floor2(value, places = 2) {
	let multiplier = Number((1).toString().padEnd((places + 1), 0));
	return Math.floor(value * multiplier + Number.EPSILON) / multiplier;
}

function round2(value, places = 2) {
	let multiplier = Number((1).toString().padEnd((places + 1), 0));
	return Math.round(value * multiplier + Number.EPSILON) / multiplier;
}


// Send 0x1A1 KCAN2 message for vehicle speed
// BE DE 4A 12 91
// - or -
// 00 00 4A 12 00
//
// B2 : Speed LSB
// B3 : Speed MSB

// Example:
// 124A (hex) = 4682 (dec) / 100 = 46.82 KPH
//
// (((18 * 256) + 74) / 100) = 46.82 KPH
//
// Input is in KPH
function encode_1a1(speed = 0) {
	speed = speed * 100;

	let lsb = speed        & 0xFF || 0; // LSB
	let msb = (speed >> 8) & 0xFF || 0; // MSB

	let msg = [ 0x00, 0x00, lsb, msb, 0x00 ];

	// Send packet
	bus.data.send({
		bus  : config.nbt.can_intf,
		id   : 0x1A1,
		data : Buffer.from(msg),
	});
}

// 0x153
//
// Example
// B0 B1 B2 B3 B4 B5 B6 B7
// 00 E0 3D FF 00 FE FF 08
//
// Logged values
// B0 B1 B2 B3 B4 B5 B6 B7
// 00 00 01 5F 00 FE 5F 00
// 01 02 .. ..       .. ..
// 10 08 45 FF       FF 0F
// 00 0A
//    0B
//    ..
//    F0
//    F2
//    F8
//    FA
//    FB
//
// Byte 0, bit 0 :
// Byte 0, bit 1 :
// Byte 0, bit 2 :
// Byte 0, bit 3 :
// Byte 0, bit 4 :
// Byte 0, bit 5 :
// Byte 0, bit 6 :
// Byte 0, bit 7 :
//
// Byte 1, bit 0 : DSC off
// Byte 1, bit 1 :
// Byte 1, bit 2 :
// Byte 1, bit 3 :
// Byte 1, bit 4 : Brake applied (unconfirmed)
// Byte 1, bit 5 : Speed LSB
// Byte 1, bit 6 : Speed LSB
// Byte 1, bit 7 : Speed LSB

// Byte 2 : Speed MSB [Signal startbit: 12, Bit length: 12, 0x0008 = 1 km/hr]
// Byte 3 : Torque reduction 1
// Byte 4 :
// Byte 5 :
// Byte 6 : Torque reduction 2
// Byte 7 :
function parse_153(data) {
	// ~5 sec on initial key in run
	// A4 61 01 FF 00 FE FF 0B
	//
	// B3 and B6 change during torque reduction
	let parse = {
		vehicle : {
			brake : bitmask.test(data.msg[1], 0x10),

			dsc : {
				active : !bitmask.test(data.msg[1], 0x01),

				torque_reduction_1 : round2(100 - (data.msg[3] / 2.55)),
				torque_reduction_2 : round2(100 - (data.msg[6] / 2.55)),
			},
		},
	};

	// update.status('vehicle.brake',                  parse.vehicle.brake);
	update.status('vehicle.dsc.active',             parse.vehicle.dsc.active, false);
	update.status('vehicle.dsc.torque_reduction_1', parse.vehicle.dsc.torque_reduction_1);
	update.status('vehicle.dsc.torque_reduction_2', parse.vehicle.dsc.torque_reduction_2);
}

// Parse wheel speed LSB and MSB into KPH value
function parse_wheel(byte0, byte1) {
	return (((byte0 & 0xFF) | ((byte1 & 0x0F) << 8)) / 16) - 2.75;
}

function parse_1f0(data) {
	let wheel_speed = {
		front : {
			left  : parse_wheel(data.msg[0], data.msg[1]),
			right : parse_wheel(data.msg[2], data.msg[3]),
		},

		rear : {
			left  : parse_wheel(data.msg[4], data.msg[5]),
			right : parse_wheel(data.msg[6], data.msg[7]),
		},
	};

	// Calculate vehicle speed from average of all 4 sensors
	let vehicle_speed_total = wheel_speed.front.left + wheel_speed.front.right + wheel_speed.rear.left + wheel_speed.rear.right;

	// Average all wheel speeds together and include accuracy offset multiplier
	// let vehicle_speed_kmh = round2((vehicle_speed_total / 4) * config.speedometer.offset);
	let vehicle_speed_kmh = round2(vehicle_speed_total / 4);

	// Calculate vehicle speed value in MPH
	let vehicle_speed_mph = Math.floor(convert(vehicle_speed_kmh).from('kilometre').to('us mile'));


	// Update status object
	update.status('vehicle.wheel_speed.front.left',  wheel_speed.front.left);
	update.status('vehicle.wheel_speed.front.right', wheel_speed.front.right);
	update.status('vehicle.wheel_speed.rear.left',   wheel_speed.rear.left);
	update.status('vehicle.wheel_speed.rear.right',  wheel_speed.rear.right);

	if (update.status('vehicle.speed.kmh', vehicle_speed_kmh)) {
		if (config.translate.dsc === true) {
			// Re-encode this message as CANBUS ARBID 0x1A1
			encode_1a1(vehicle_speed_kmh);
		}
	}

	update.status('vehicle.speed.mph', vehicle_speed_mph);
}

// TODO: This.... needs help
function parse_1f5(data) {
	let angle = 0;
	// Specifically these horrific if statements
	if (data.msg[1] > 127) {
		angle = -1 * (((data.msg[1] - 128) * 256) + data.msg[0]);
	}
	else {
		angle = (data.msg[1] * 256) + data.msg[0];
	}

	let velocity = 0;
	// These are an embarrasment
	if (data.msg[3] > 127) {
		velocity = -1 * (((data.msg[3] - 128) * 256) + data.msg[2]);
	}
	else {
		velocity = (data.msg[3] * 256) + data.msg[2];
	}

	// 0.043393 : 3.75 turns, lock to lock (1350 degrees of total rotation)
	let steering_multiplier = 0.043393;

	let steering = {
		angle    : Math.floor(angle    * steering_multiplier) * -1, // Thanks babe
		velocity : Math.floor(velocity * steering_multiplier) * -1,
	};


	update.status('vehicle.steering.angle',    steering.angle);
	update.status('vehicle.steering.velocity', steering.velocity);
}

// Parse data sent from module
function parse_out(data) {
	data.command = 'bro';

	switch (data.src.id) {
		case 0x153 : parse_153(data); data.value = 'Speed/DSC light'; break;
		case 0x1F0 : parse_1f0(data); data.value = 'Wheel speeds';    break;

		// 00 00 05 FF 39 7D 5D 00
		// byte2 bit3 : brake applied
		case 0x1F3 :                  data.value = 'Transverse acceleration'; break;
		case 0x1F5 : parse_1f5(data); data.value = 'Steering angle';          break;

		case 0x1F8:
			// Brake pressure messages observed in 2002 E39 M5
			//
			//       B0 B1 B2 B3 B4 B5 B6 B7
			// 077F  14 14 00 00 00 00 82 01
			//
			// B6 : Pedal pressure LSB
			// B7 : Pedal pressure MSB
			//
			//       XX XX    XX          XX
			// 07B5  30 30 00 30 00 00 00 42
			//
			//
			//
			// 0xB8 = DME? KWP2000 protocol
			// Status sensors (21 06):
			// Positive pressure:
			// B8 29 F1 02 21 06 45
			//                               XX XX XX XX
			// B8 F1 29 0F 61 06 00 00 C3 DC 14 8F 14 A4 00 00 00 00 11 06
			//
			// BrakeLinePressureFront = hex2dec('148F')/100 = 52.63 [bar]
			// BrakeLinePressureRear  = hex2dec('14A4')/100 = 52.84 [bar]
			//
			// BrakeLinePressureFront = hex2dec('1D31')/100 = 74.73 [bar]
			// BrakeLinePressureRear  = hex2dec('1D1C')/100 = 74.52 [bar]
			//
			// Neg. pressure by twos complement:
			// B8 29 F1 02 21 06 45
			// B8 F1 29 0F 61 06 00 00 C3 DC F7 ED F7 83 00 00 00 00 11 06
			//
			// BrakeLinePressureFront = (hex2dec('F7ED')-65536)/100 = -20.67 [bar]
			// BrakeLinePressureRear  = (hex2dec('F783')-65536)/100 = -21.73 [bar]
			// BrakeLinePressureFront = (hex2dec('FFA5')-65536)/100 = -0.91 [bar]
			//
			//
			// Status sensor offset (21 02):
			// B8 29 F1 02 21 02 41
			// B8 F1 29 0C 61 02 FA89 FF18 1E81 FE5D 0000 A7
			//
			// B8 F1 29 0C 61 02 xxxx yyyy 1E81 FE5D 0000 A7
			// xxxx = hex value in telegram of Offset Front
			// yyyy = hex value in telegram of Offset Rear
			// BrakeLinePressureFrontOffset = 0.000625*x + 2.3315e-15
			// BrakeLinePressureRearOffset  = 0.000625*y + 2.3315e-15
			//
			// where x is twos complement of xxxx (or yyyy)
			// if neg value in xxxx (or yyyy) (msb set), otherwise pos value of xxxx (or yyyy)
			//
			// Example: 0xFA89 => neg value since msb=1
			// Twos complement of 0xFA89 = -1399 => -0.87438 [bar]
			data.value = 'Brake pressure';
			break;

		default : data.value = data.src.id.toString(16);
	}
}


function init_listeners() {
	// Send vehicle speed 0 to CAN1 on power module events
	// This is because vehicle speed isn't received via CAN0 when key is in accessory
	update.on('status.power.active', () => {
		setTimeout(() => {
			encode_1a1(0);
		}, 250);
	});

	log.msg('Initialized listeners');
}


module.exports = {
	init_listeners : init_listeners,

	encode_1a1 : encode_1a1,

	parse_out : parse_out,
};
