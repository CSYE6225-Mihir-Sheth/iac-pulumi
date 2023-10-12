const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const config = new pulumi.Config();
// Load configurations
//onst config = new pulumi.Config();

//const AWS_REGION = config.require("aws:region");


const vpcCidr = config.require("VPC_CIDR");
const basePublicSubnetCidr = config.require("SUB_CIDR");
const basePrivateSubnetCidr = basePublicSubnetCidr;

// const provider = new aws.Provider("myProvider", {
//     region: AWS_REGION,
// });

// Create VPC
const vpc = new aws.ec2.Vpc(config.require("VPC_NAME"), {
    cidrBlock: vpcCidr,
    // enableDnsSupport: true,
    // enableDnsHostnames: true,
    tags: {
        "Name": config.require("VPC_NAME")
    }
});

// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(config.get("iac-pulumi:INTERNET_GATEWAY_NAME") || "customVpcIGW", {
    tags: {
        "Name": config.get("iac-pulumi:INTERNET_GATEWAY_NAME") || "cloud_VpcIGW"
    }
});

// Attach the Internet Gateway to the VPC
const vpcIgAttachment = new aws.ec2.InternetGatewayAttachment("customVpcIGWAttachment", {
    vpcId: vpc.id,
    internetGatewayId: internetGateway.id,
});

// Determine the availability zones using the AWS_REGION
aws.getAvailabilityZones({  state: "available" }).then(azs => {
    const maxZones = 3;
    const numberOfZones = Math.min(azs.names.length, maxZones);

    let publicSubnets = [];
    let privateSubnets = [];

    let cidrCounter = 1; // Start from 1 for 10.0.0.1/24

// Create subnets across the restricted number of AZs
for (let i = 0; i < numberOfZones; i++) {
    // Public Subnets
    const publicSubnetCidr = `10.0.${cidrCounter}.0/24`;
    const publicSubnet = new aws.ec2.Subnet(`${config.get("iac-pulumi:PUBLIC_SUBNET_NAME") || "publicSubnet-"}${i}`, {
        vpcId: vpc.id,
        cidrBlock: publicSubnetCidr,
        availabilityZone: azs.names[i],
        mapPublicIpOnLaunch: true,
        tags: {
            "Name": `${config.get("iac-pulumi:PUBLIC_SUBNET_NAME") || "publicSubnet-"}${i}`
        }
    });
    publicSubnets.push(publicSubnet);
    cidrCounter++;

    // Private Subnets
    const privateSubnetCidr = `10.0.${cidrCounter}.0/24`;
    const privateSubnet = new aws.ec2.Subnet(`${config.get("iac-pulumi:PRIVATE_SUBNET_NAME") || "privateSubnet-"}${i}`, {
        vpcId: vpc.id,
        cidrBlock: privateSubnetCidr,
        availabilityZone: azs.names[i],
        tags: {
            "Name": `${config.get("iac-pulumi:PRIVATE_SUBNET_NAME") || "privateSubnet-"}${i}`
        }
    });
    privateSubnets.push(privateSubnet);
    cidrCounter++;
}


    // Create a public route table and attach all public subnets to it
const publicRouteTableName = config.get("iac-pulumi:PUBLIC_ROUTE_TABLE_NAME") || "publicRouteTable";
const publicRouteTable = new aws.ec2.RouteTable(publicRouteTableName, {
    vpcId: vpc.id,
});

for (let i = 0; i < publicSubnets.length; i++) {
    new aws.ec2.RouteTableAssociation(`${config.get("iac-pulumi:PUBLIC_ASSOCIATION_NAME") || "publicRouteTableAssociation-"}${i}`, {
        subnetId: publicSubnets[i].id,
        routeTableId: publicRouteTable.id,
    });
}

// new aws.ec2.Route("publicRoute", {
//     routeTableId: publicRouteTable.id,
//     destinationCidrBlock: config.get("iac-pulumi:ROUTE TO INTERNET") || "0.0.0.0/0",
//     gatewayId: internetGateway.id,
// });

// Create a private route table and attach all private subnets to it
const privateRouteTableName = config.get("iac-pulumi:PRIVATE_ROUTE_TABLE_NAME") || "privateRouteTable";
const privateRouteTable = new aws.ec2.RouteTable(privateRouteTableName, {
    vpcId: vpc.id,
});

for (let i = 0; i < privateSubnets.length; i++) {
    new aws.ec2.RouteTableAssociation(`${config.get("iac-pulumi:PRIVATE_ASSOCIATION_NAME") || "privateRouteTableAssociation-"}${i}`, {
        subnetId: privateSubnets[i].id,
        routeTableId: privateRouteTable.id,
    });
}

}).catch(err => {
    console.error("Error fetching availability zones:", err);
});

// export const vpcId = vpc.id;
