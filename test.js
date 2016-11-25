var Bleacon = require('./index');
var request = require('request');
var _ = require('underscore');

var noble = require('noble');
var estimote = require('./estimote/estimote.js');
var NobleDevice = require('noble-device');

var parseEstimoteTelemetryPacket = require("./lib/telemetry.js").parseEstimoteTelemetryPacket;
var ESTIMOTE_SERVICE_UUID = 'fe9a';
var EXPECTED_MANUFACTURER_DATA_LENGTH = 22;

var vehicles = [];

function Vehicle(shortIdentifier) {
    this.shortIdentifier = shortIdentifier;
}

noble.on('stateChange', function(state) {
  console.log('state has changed', state);
  if (state == 'poweredOn') {
    var serviceUUIDs = [ESTIMOTE_SERVICE_UUID]; // Estimote Service
    var allowDuplicates = true;
    noble.startScanning(serviceUUIDs, allowDuplicates, function(error) {
     if (error) {
      console.log('error starting scanning', error);
      } else {
       console.log('started scanning');
    }
   });
  }
});


noble.on('discover', function(peripheral) {
    var serviceData = peripheral.advertisement.serviceData[0].data;

    var data = peripheral.advertisement.serviceData.find(function(el) {
        return el.uuid == ESTIMOTE_SERVICE_UUID;
    }).data;

    var telemetryPacket = parseEstimoteTelemetryPacket(data);

    if (telemetryPacket) {
        // console.log(JSON.stringify(telemetryPacket));
        let discoveredVehicle = new Vehicle(telemetryPacket.shortIdentifier);

        let isExistent = checkIfVehicleExists(discoveredVehicle, vehicles);

        if (isExistent >= 0) {


            vehicles[isExistent].measurementsData.push(calculateDistance4(-56, peripheral.rssi));

            updateTelemetry(telemetryPacket, vehicles[isExistent]);

            if (telemetryPacket.isMoving) {
                clearMeasurementsData(vehicles[isExistent], telemetryPacket.isMoving);
            }

            sortMeasurementsData(vehicles[isExistent]);

            vehicles[isExistent].distance = transformDistance(calculateDistance(vehicles[isExistent]));

            cutExcesiveMeasurements(vehicles[isExistent]);

        } else {
            discoveredVehicle.measurementsData = [];
            updateTelemetry(telemetryPacket, discoveredVehicle);
            vehicles.push(discoveredVehicle);
        }

    }
});

function transformDistance(dist){
	if(dist <= 2.8)
  	        return "0";
	else if(dist > 2.8 && dist <= 3.15)
		return "50";
	else if(dist > 3.15 && dist <= 3.25)
		return "100";
	else if(dist > 3.25 && dist <= 3.5)
		return "150";
	else if(dist > 3.5 && dist <= 3.6)
		return "200";
	else if(dist > 3.6 && dist <= 3.85)
		return "250";
	else if(dist > 3.7 && dist <= 3.88)
		return "300";
	else if(dist > 3.88)
		return "400";
}

function cutExcesiveMeasurements(vehicle) {
    let maximumValuesPermited = 50;
    if (vehicle.measurementsData.length > maximumValuesPermited) {
        var offset = Math.floor(getOffsetFromPercent(34, vehicle.measurementsData.length));;
        dropExtremeValues(vehicle.measurementsData, offset);
    }
}

function calculateDistance(vehicle) {
    let result;
    var offset = Math.floor(getOffsetFromPercent(34, vehicle.measurementsData.length));;
    var selectedArray = getMiddleValues(vehicle.measurementsData, offset);
    result = calculateArithmeticValue(selectedArray);

    return result;

}

function getMiddleValues(array, offset) {
    var result = [];
    for (var j = offset; j < (array.length - offset); j++) {
       result.push(array[j]);
     }
    return result;
}

function sortMeasurementsData(vehicle) {
    vehicle.measurementsData = vehicle.measurementsData.sort(sortNumber);
}

function clearMeasurementsData(vehicle, boolean) {
    if (boolean) {
        vehicle.measurementsData = [];
    }
}

function updateTelemetry(telemetryPacket, vehicle) {
    if (telemetryPacket.subFrameType === 'A') {
        updateVehicleWithATelemetry(telemetryPacket, vehicle);
    } else if (telemetryPacket.subFrameType === 'B') {
        updateVehicleWithBTelemetry(telemetryPacket, vehicle);
    }
}

function updateVehicleWithATelemetry(telemetryPacket, vehicle) {
    vehicle.acceleration = telemetryPacket.acceleration;
    vehicle.isMoving = telemetryPacket.isMoving;
    vehicle.motionStateDuration = telemetryPacket.motionStateDuration;
    vehicle.gpio = telemetryPacket.gpio;
}

function updateVehicleWithBTelemetry(telemetryPacket, vehicle) {
    vehicle.magneticField = telemetryPacket.magneticField;
    vehicle.ambientLightLevel = telemetryPacket.ambientLightLevel;
    vehicle.temperature = telemetryPacket.temperature;
    vehicle.uptime = telemetryPacket.uptime;
    vehicle.batteryVoltage = telemetryPacket.batteryVoltage;
    vehicle.batteryLevel = telemetryPacket.batteryLevel;
}

var postingData = function(interval, path, data) {
    setInterval(function() {

        // displayDistance(data, 'f572395096619970');

        request.post(path,
            {json: true, body: data},
            function(err, res, body) {
                displayPostStatus(body);
            }
        );

    }, interval);
};

postingData(1000, 'http://localhost:8090/vehiclesposition', vehicles);


// HELPER FUNCTIONS
// ================

function displayDistance(data, beacon) {
    for (var i = 0; i < data.length; i++) {
        if (data[i].shortIdentifier == beacon) {
            console.log('Beacon beetroot');
            console.log(data[i].distance);
            console.log('================');

        }
    }
}

function displayPostStatus(body) {
    if (body) {
        console.log("Posting the vehicles was ok.");
    } else {
        console.log("Posting the vehicles failed.");
    }
}

var displayRaw = function(){
    Bleacon.on('discover', function(bleacon) {
        displayRawBleacon(bleacon);
    });
};

function sortByKey(array, key) {
    return array.sort(function(a, b) {
        var x = a[key]; var y = b[key];
        return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    });
}

// Returns -1 if car is not in array, and returns the index of array where it was found if car was found
function checkIfVehicleExists(vehicle, array) {
    for (var i = 0; i < array.length; i++) {
        if (vehicle.shortIdentifier == array[i].shortIdentifier) {
            return i;
        }
    }
    return -1;
}

function calculateArithmeticValue(array) {
    var calculatedValue = 0;
    for (var i = 0; i < array.length; i++) {
       calculatedValue = calculatedValue + array[i];
    }
    return calculatedValue / array.length;
}

function dropExtremeValues(array, dropValues) {
    array.splice(0, dropValues);
    array.splice(-dropValues, dropValues);
}

function sortNumber(a, b) {
    return a - b;
}

// d = 10^((TxPower - RSSI)/20)
function calculateDistance1(rssi) {
    return Math.pow(10, (4 - rssi)/20);
}

// takes into account that measuredPower is 1m distance
function calculateDistance2(measuredPower, rssi) {
    return rssi/measuredPower;
}

// stackoverflow.com/questions/20416218/understanding-ibeacon-distancing/20434019#20434019
function calculateDistance3(txCalibratedPower, rssi) {
    var ratio_db = txCalibratedPower - rssi;
    var ratio_linear = Math.pow(10, ratio_db / 10);

    return Math.sqrt(ratio_linear);
}

function calculateDistance4(txPower, rssi) {
    if (rssi == 0) {
        return -1;
    }

    var ratio = rssi*1/txPower;
    if (ratio < 1) {
        return Math.pow(ratio, 10);
    } else {
        accuracy = 0.899 * Math.pow(ratio, 7.709) + 0.111;
        return accuracy;
    }
}

function calculateDistance5(peripheral) {
    var ratio = peripheral.rssi * 1.0 / -55;

    if (ratio < 1.0) {
        return Math.pow(ratio, 10);
    } else {
        var accuracy = 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
        return accuracy;
    }
}

// display only rssi
function calculateRssi(rssi) {
    return rssi;
}

function displayRawBleacon(bleacon) {
    console.log('bleacon found: ' + JSON.stringify(bleacon));
}

function getOffsetFromPercent(percent, segmentLength) {
    return (segmentLength * percent) / 100;
}
