// Ignition status
function decode_ignition(data) {
	data.command = 'bro';
	data.value   = 'Ignition status';

	let new_level_name;

	// Save previous ignition status
	let previous_level = status.vehicle.ignition_level;

	// Set ignition status value
	update.status('vehicle.ignition_level', data.msg[0], false);

	switch (data.msg[0]) {
		case 0x00 : new_level_name = 'off'; break;

		case 0x40 : // Whilst just beginning to turn the key
		case 0x41 : new_level_name = 'accessory'; break;

		case 0x45 : new_level_name = 'run';   break;
		case 0x55 : new_level_name = 'start'; break;

		default : new_level_name = 'unknown';
	}

	update.status('vehicle.ignition', new_level_name, false);

	if (data.msg[0] > previous_level) { // Ignition going up
		switch (data.msg[0]) { // Evaluate new ignition state
			case 0x40 :
			case 0x41 : { // Accessory
				log.module('Powerup state');
				break;
			}

			case 0x45 : { // Run
				// If the accessory (1) ignition message wasn't caught
				if (previous_level === 0) {
					log.module('Powerup state');
				}

				log.module('Run state');

				// Send gauge sweep messages to KOMBI if configured
				if (config.kombi.sweep === true && config.chassis.model === 'e60') {
					log.module('Executing KOMBI gauge sweep');

					// Speedo
					bus.data.send({
						bus  : config.kombi.can_intf,
						id   : 0x6F1,
						data : Buffer.from([ 0x60, 0x05, 0x30, 0x20, 0x06, 0x12, 0x3B, 0xFF ]),
					});

					// Tach
					setTimeout(() => {
						bus.data.send({
							bus  : config.kombi.can_intf,
							id   : 0x6F1,
							data : Buffer.from([ 0x60, 0x05, 0x30, 0x21, 0x06, 0x12, 0x0E, 0xFF ]),
						});

						setTimeout(() => {
							log.module('Executing KOMBI gauge reset');

							// Reset speedo
							bus.data.send({
								bus  : config.kombi.can_intf,
								id   : 0x6F1,
								data : Buffer.from([ 0x60, 0x03, 0x30, 0x20, 0x00, 0xFF, 0xFF, 0xFF ]),
							});

							// Reset tach
							setTimeout(() => {
								bus.data.send({
									bus  : config.kombi.can_intf,
									id   : 0x6F1,
									data : Buffer.from([ 0x60, 0x03, 0x30, 0x21, 0x00, 0xFF, 0xFF, 0xFF ]),
								});
							}, 50);
						}, 1500);
					}, 50);
				}
				break;
			}

			case 0x55 : { // Start
				switch (previous_level) {
					case 0x00 : { // If the accessory (1) ignition message wasn't caught
						log.module('Powerup state');
						break;
					}

					case 0x45 : { // If the run (3) ignition message wasn't caught
						log.module('Run state');
						break;
					}

					default : {
						log.module('Start-begin state');
					}
				}
			}
		}
	}
	else if (data.msg[0] < previous_level) { // Ignition going down
		switch (data.msg[0]) { // Evaluate new ignition state
			case 0x00 : { // Off
				// If the accessory (1) ignition message wasn't caught
				if (previous_level === 0x45) {
					log.module('Powerdown state');
				}

				log.module('Poweroff state');
				break;
			}

			case 0x40 :
			case 0x41 : { // Accessory
				log.module('Powerdown state');
				break;
			}

			case 0x45 : { // Run
				log.module('Start-end state');
			}
		}
	}

	data.command = 'bro';
	data.value   = 'ignition: ' + status.vehicle.ignition;

	return data;
}


// [0x2FC] Decode a door status message from CAS and act upon the results
function decode_status_open(data) {
	data.command = 'bro';
	data.value   = 'door status';

	// Set status from message by decoding bitmask
	update.status('doors.front_left',  bitmask.test(data.msg[1], 0x01), false);
	update.status('doors.front_right', bitmask.test(data.msg[1], 0x04), false);
	update.status('doors.hood',        bitmask.test(data.msg[2], 0x04), false);
	update.status('doors.rear_left',   bitmask.test(data.msg[1], 0x10), false);
	update.status('doors.rear_right',  bitmask.test(data.msg[1], 0x40), false);
	update.status('doors.trunk',       bitmask.test(data.msg[2], 0x01), false);

	// Set status.doors.closed if all doors are closed
	let update_closed_doors = (!status.doors.front_left && !status.doors.front_right && !status.doors.rear_left && !status.doors.rear_right);
	update.status('doors.closed', update_closed_doors, false);

	// Set status.doors.open if any doors are open
	update.status('doors.open', (update_closed_doors === false), false);

	// Set status.doors.sealed if all doors and flaps are closed
	let update_sealed_doors = (status.doors.closed && !status.doors.hood && !status.doors.trunk);
	update.status('doors.sealed', update_sealed_doors, false);

	return data;
}

// Parse data sent to module
function parse_in(data) {
	// Bounce if not enabled
	if (config.emulate.nbt !== true) return;

	switch (data.msg[0]) {
		default : {
			data.command = 'unk';
			data.value   = Buffer.from(data.msg);
		}
	}

	log.bus(data);
}

// Parse data sent from module
function parse_out(data) {
	switch (data.src.id) {
		case 0x130 : data = decode_ignition(data);    break;
		case 0x2FC : data = decode_status_open(data); break;

		default : {
			data.command = 'unk';
			data.value   = Buffer.from(data.msg);
		}
	}

	// log.bus(data);
}


module.exports = {
	parse_in  : parse_in,
	parse_out : parse_out,
};
