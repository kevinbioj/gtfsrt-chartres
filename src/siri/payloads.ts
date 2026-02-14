import { randomUUID } from "node:crypto";

export const LINES_DISCOVERY = (requestorRef: string) =>
	`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
    <S:Body>
      <sw:LinesDiscovery xmlns:sw="http://wsdl.siri.org.uk" xmlns:siri="http://www.siri.org.uk/siri">
        <Request>
          <siri:RequestTimestamp>${new Date().toISOString()}</siri:RequestTimestamp>
          <siri:RequestorRef>${requestorRef}</siri:RequestorRef>
          <siri:MessageIdentifier>BUS-TRACKER.FR::Message::${randomUUID()}</siri:MessageIdentifier>
        </Request>
        <RequestExtension/>
      </sw:LinesDiscovery>
    </S:Body>
  </S:Envelope>`;

export const GET_VEHICLE_MONITORING = (
	requestorRef: string,
	lineRef: string,
) => {
	const requestTimestamp = new Date().toISOString();
	const messageIdentifier = `BUS-TRACKER.FR::Message::${randomUUID()}`;
	return `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
      <S:Body>
        <sw:GetVehicleMonitoring xmlns:sw="http://wsdl.siri.org.uk" xmlns:siri="http://www.siri.org.uk/siri">
          <ServiceRequestInfo>
            <siri:RequestTimestamp>${requestTimestamp}</siri:RequestTimestamp>
            <siri:RequestorRef>${requestorRef}</siri:RequestorRef>
            <siri:MessageIdentifier>${messageIdentifier}</siri:MessageIdentifier>
          </ServiceRequestInfo>
          <Request version="2.0:FR-IDF-2.4">
            <siri:RequestTimestamp>${requestTimestamp}</siri:RequestTimestamp>
            <siri:MessageIdentifier>${messageIdentifier}</siri:MessageIdentifier>
            <siri:LineRef>${lineRef}</siri:LineRef>
          </Request>
          <RequestExtension/>
        </sw:GetVehicleMonitoring>
      </S:Body>
    </S:Envelope>`;
};
